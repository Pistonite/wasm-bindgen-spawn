#![doc = include_str!("../README.md")]

#[cfg(all(target_arch = "wasm32", not(target_feature = "atomics"), not(doc)))]
compile_error!(
    "Some target features are not enabled. Please read the README and set the right rustflags"
);

use std::panic::UnwindSafe;
use std::ptr::NonNull;
use std::sync::atomic::AtomicUsize;
use std::sync::mpsc;

use js_sys::{Function, Promise};
use wasm_bindgen::prelude::*;
#[cfg(feature = "async")]
use wasm_bindgen_futures::JsFuture;

type BoxClosure = Box<dyn FnOnce() -> BoxValue + Send + UnwindSafe + 'static>;
type BoxValue = Box<dyn Send + 'static>;
type ValueSender = oneshot::Sender<Result<BoxValue, JoinError>>;
type ValueReceiver = oneshot::Receiver<Result<BoxValue, JoinError>>;

type DispatchPayload = (usize, BoxClosure, ValueSender);
type DispatchSender = mpsc::Sender<DispatchPayload>;
type DispatchReceiver = mpsc::Receiver<DispatchPayload>;

type SignalSender = oneshot::Sender<()>;
type SignalReceiver = oneshot::Receiver<()>;

/// Error when joining a thread with a [`JoinHandle`]
#[derive(Debug, thiserror::Error)]
pub enum JoinError {
    #[error("WASM thread {0} panicked")]
    Panic(usize),
}

/// Error when spawning a thread with [`ThreadCreator::spawn`]
#[derive(Debug, thiserror::Error)]
pub enum SpawnError {
    #[error("Cannot spawn WASM thread because the dispatcher has disconnected")]
    Disconnected,
}

#[wasm_bindgen]
extern "C" {
    /// Binding to wasm.memory
    #[wasm_bindgen(js_name = memory, js_namespace = wasm, thread_local)]
    static MEMORY: JsValue;
    #[wasm_bindgen(js_name = __dispatch_poll_worker, js_namespace = wasm_bindgen, thread_local)]
    static DISPATCH_POLL_WORKER: JsValue;
}

/// Handle for a dedicated Web Worker for dispatching new threads.
///
/// Please see below for example and how to avoid potential deadlocks.
///
/// # Example
/// Suppose your WASM package is built with `wasm-pack` using the following command:
/// ```sh
/// wasm-pack build -t no-modules --out-dir ./pkg
/// ```
/// which should produce `pkg/your_package_bg.wasm` and `pkg/your_package.js`.
///
/// Then you can create a `ThreadCreator` with:
/// ```no_run
/// use wasm_bindgen::prelude::*;
/// use wasm_bindgen_spawm::ThreadCreator;
///
/// let thread_creator = ThreadCreator::new("pkg/your_package_bg.wasm", "pkg/your_package.js");
/// // on error, this is a JsValue error
/// assert!(thread_creator.is_ok());
/// ```
///
/// # Dispatcher ready
/// After calling [`new`](Self::new), the dispatcher is synchrounously created,
/// but the JS runtime may only start the dispatcher after the current execution.
/// Blocking the thread where the ThreadCreator is created may cause threads to never spawn.
///
/// For example, the following code will cause a deadlock:
/// ```no_run
/// use wasm_bindgen::prelude::*;
/// use wasm_bindgen_spawm::ThreadCreator;
///
/// pub fn will_deadlock() -> Result<(), Box<dyn std::error::Error>> {
///     let thread_creator = ThreadCreator::new("pkg/your_package_bg.wasm", "pkg/your_package.js")?;
///     // calling `spawn` is ok here
///     let thread = thread_creator.spawn(move || {
///         // do some work
///     })?;
///     // this will deadlock because the thread won't be spawned
///     thread.join()?;
///
///     Ok(())   
/// }
/// ```
/// To avoid this, the `ThreadCreator` has a [`ready`](Self::ready) method that you can
/// await to ensure the dispatcher is ready, before calling `spawn`.
/// ```no_run
/// use wasm_bindgen::prelude::*;
/// use wasm_bindgen_spawm::ThreadCreator;
///
/// pub async fn will_not_deadlock() -> Result<(), Box<dyn std::error::Error>> {
///     let thread_creator = ThreadCreator::new("pkg/your_package_bg.wasm", "pkg/your_package.js")?;
///     thread_creator.ready().await?;
///
///     let thread = thread_creator.spawn(move || {
///         return 42;
///     })?;
///     let value = thread.join()?;
///     assert_eq!(value, 42);
///
///     Ok(())   
/// }
/// ```
/// Note that only `ready` requires `await`, and not `spawn` or `join`. This is because
/// once the dispatcher is ready, shared memory is used for sending the spawn payload
/// to the dispatcher instead of `postMessage`. This also means you only need this async step
/// once when creating the `ThreadCreator`. You can write the rest of the code without `async`.
///
/// You can also
/// disable the `async` feature and use [`ready_promise`](Self::ready_promise) to avoid depending on `wasm-bindgen-futures`
///
/// # Joining threads
/// Joining should feel pretty much like the `std` library. However, there is one caveat -
/// The main thread in Web cannot be blocked. This means in order to join a thread, you must
/// run the WASM module in a Web Worker.
///
/// See [`JoinHandle`] for more information.
///
/// # Terminating
/// When the `ThreadCreator` is dropped, the dispatcher worker will be terminated.
/// Threads that are `spawn`-ed but not started may start or not start, but
/// threads that are already running are not impacted and can still be `join`-ed.
///
/// Generally you should avoid dropping the `ThreadCreator` until all spawned threads are joined.
/// You can create a global thread creator by using `thread_local`:
/// ```no_run
/// use wasm_bindgen::prelude::*;
/// use wasm_bindgen_spawm::ThreadCreator;
///
/// thread_local! {
///     static THREAD_CREATOR: OnceCell<ThreadCreator> = OnceCell::new();
/// }
///
/// #[wasm_bindgen]
/// pub fn create_thread_creator() -> Result<Promise, JsValue> {
///     let thread_creator = ThreadCreator::new("pkg/your_package_bg.wasm", "pkg/your_package.js")?;
///     let promise = thread_creator.ready_promise().clone();    
///     THREAD_CREATOR.with(move |tc| {
///         tc.set(thread_creator);
///     });
///     Ok(promise)
///     // the promise can then be awaited in JS (this is useful if the rest
///     // of your code doesn't need wasm-bindgen-futures)
/// }
///
/// #[wasm_bindgen]
/// pub fn do_some_work_on_thread() {
///     let handle = THREAD_CREATOR.with(|tc| {
///         let tc = tc.get().unwrap();
///         tc.spawn(move || {
///             // do some work
///         }).unwrap()
///     });
///
///     handle.join().unwrap();
/// }
/// ```
pub struct ThreadCreator {
    next_id: AtomicUsize,
    /// Promise for if the dispatcher is ready
    dispatcher_promise: Promise,
    /// Sender to send the thread closure to the dispatcher for creating threads
    send: DispatchSender,
}

impl ThreadCreator {
    /// Create a Web Worker to dispatch threads with the wasm module url and the
    /// wasm_bindgen JS url.
    ///
    /// See the struct documentation for more information
    pub fn new(wasm_url: &str, wbg_url: &str) -> Result<Self, JsValue> {
        // function([wasm_url, wbg_url, memory, recv]) -> Promise<void>;
        let create_dispatcher =
            Function::new_with_args("args", include_str!("js/createDispatcher.min.js"));
        let wasm_url = JsValue::from_str(wasm_url);
        let wbg_url = JsValue::from_str(wbg_url);
        let memory = MEMORY.with(|memory| memory.clone());
        let (send, recv) = mpsc::channel::<DispatchPayload>();
        let recv_ptr = JsValue::from(NonNull::from(Box::leak(Box::new(recv))));
        let (start_send, start_recv) = oneshot::channel::<()>();
        let start_send = Box::into_raw(Box::new(start_send));
        let start_recv = Box::into_raw(Box::new(start_recv));
        let start_send_ptr = unsafe { NonNull::new_unchecked(start_send) };
        let start_recv_ptr = unsafe { NonNull::new_unchecked(start_recv) };
        // create the dispatcher
        let promise = create_dispatcher
            .call1(
                &JsValue::null(),
                &JsValue::from(vec![
                    wasm_url,
                    wbg_url,
                    memory,
                    recv_ptr,
                    JsValue::from(start_send_ptr),
                    JsValue::from(start_recv_ptr),
                    DISPATCH_POLL_WORKER.with(|v| v.clone()),
                ]),
            )?
            .dyn_into::<Promise>()?;
        Ok(Self {
            next_id: AtomicUsize::new(1),
            dispatcher_promise: promise,
            send,
        })
    }

    /// Returns the promise that resolves when the dispatcher is ready
    ///
    /// See the struct documentation for more information
    pub fn ready_promise(&self) -> &Promise {
        &self.dispatcher_promise
    }

    /// Await the dispatcher to be ready.
    ///
    /// See the struct documentation for more information
    #[cfg(feature = "async")]
    pub async fn ready(&self) -> Result<(), JsValue> {
        JsFuture::from(self.dispatcher_promise.clone()).await?;
        Ok(())
    }

    /// Spawn a new thread to execute F.
    ///
    /// Note that spawning new thread is very slow. Pool them if you can.
    pub fn spawn<F, T>(&self, f: F) -> Result<JoinHandle<T>, SpawnError>
    where
        F: FnOnce() -> T + Send + 'static + UnwindSafe,
        T: Send + 'static,
    {
        let next_id = self
            .next_id
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        // make a closure that returns the value boxed
        let closure: BoxClosure = Box::new(move || Box::new(f()));
        let (send, recv) = oneshot::channel();
        let payload = (next_id, closure, send);
        self.send
            .send(payload)
            .map_err(|_| SpawnError::Disconnected)?;

        Ok(JoinHandle {
            id: next_id,
            recv,
            _marker: std::marker::PhantomData,
        })
    }
}

/// Handle for joining a thread
pub struct JoinHandle<T: Send + 'static> {
    id: usize,
    recv: ValueReceiver,
    _marker: std::marker::PhantomData<T>,
}

impl<T: Send + 'static> JoinHandle<T> {
    /// Join the thread. Block the current thread until the thread is finished.
    ///
    /// Returns the value returned by the thread closure. If the thread panicked,
    /// this returns a [`JoinError`].
    ///
    /// # Unwind and Poisoning
    /// Note that `wasm32-unknown-unknown` target does not support unwinding yet.
    /// This means safety mechanisms like poisoning are not available. Panicking
    /// while holding a lock will not release the lock and will likely produce a dead lock.
    pub fn join(self) -> Result<T, JoinError> {
        // recv() will only error if somehow the thread terminated without sending a value
        let value = self.recv.recv().map_err(|_| JoinError::Panic(self.id))?;
        // will error if panicked
        let value = value?;
        // cast the raw pointer back
        let value_raw = Box::into_raw(value) as *mut T;
        let value = unsafe { Box::from_raw(value_raw) };
        Ok(*value)
    }
}

#[inline]
fn make_closure<F: FnOnce() -> BoxValue + Send + 'static + UnwindSafe>(
    f: F,
) -> NonNull<BoxClosure> {
    let boxed: BoxClosure = Box::new(f);
    NonNull::from(Box::leak(Box::new(boxed)))
}

#[doc(hidden)]
#[wasm_bindgen]
pub fn __worker_main(f: NonNull<BoxClosure>, start: NonNull<SignalSender>) -> NonNull<BoxValue> {
    // signal the dispatcher that the worker is now started, and is safe to block
    __dispatch_start(start);
    let f = unsafe { Box::from_raw(f.as_ptr()) };
    let value = f();
    let value_ptr = Box::into_raw(Box::new(value));
    unsafe { NonNull::new_unchecked(value_ptr) }
}

#[doc(hidden)]
#[wasm_bindgen]
pub fn __worker_send(id: usize, send: NonNull<ValueSender>, value: Option<NonNull<BoxValue>>) {
    let send_ptr = send.as_ptr();
    let send = unsafe { Box::from_raw(send_ptr) };
    match value {
        None => {
            let _ = send.send(Err(JoinError::Panic(id)));
        }
        Some(value) => {
            let value = unsafe { Box::from_raw(value.as_ptr()) };
            let _ = send.send(Ok(*value));
        }
    }
}

#[doc(hidden)]
#[wasm_bindgen]
pub fn __dispatch_start(start: NonNull<SignalSender>) {
    let start_ptr = start.as_ptr();
    let start = unsafe { Box::from_raw(start_ptr) };
    let _ = start.send(());
}

#[doc(hidden)]
#[wasm_bindgen]
pub fn __dispatch_recv(recv: NonNull<DispatchReceiver>) -> Option<Vec<JsValue>> {
    // cast as reference so we don't drop it
    let recv: &DispatchReceiver = unsafe { recv.as_ref() };
    let (id, closure, sender) = match recv.recv() {
        Ok(v) => v,
        Err(_) => return None,
    };
    let sender_ptr = NonNull::from(Box::leak(Box::new(sender)));
    let (start_send, start_recv) = oneshot::channel::<()>();
    let start_send_ptr = NonNull::from(Box::leak(Box::new(start_send)));
    let start_recv_ptr = NonNull::from(Box::leak(Box::new(start_recv)));
    let value_vec = vec![
        id.into(),
        make_closure(closure).into(),
        sender_ptr.into(),
        start_send_ptr.into(),
        start_recv_ptr.into(),
    ];
    Some(value_vec)
}

#[doc(hidden)]
#[wasm_bindgen]
pub fn __dispatch_poll_worker(start_recv: NonNull<SignalReceiver>) -> bool {
    if unsafe { start_recv.as_ref() }.try_recv().is_ok() {
        let start_recv = unsafe { Box::from_raw(start_recv.as_ptr()) };
        drop(start_recv);
        true
    } else {
        false
    }
}

#[doc(hidden)]
#[wasm_bindgen]
pub fn __dispatch_drop(recv: NonNull<mpsc::Receiver<BoxClosure>>) {
    let recv: Box<mpsc::Receiver<BoxClosure>> = unsafe { Box::from_raw(recv.as_ptr()) };
    drop(recv);
}
