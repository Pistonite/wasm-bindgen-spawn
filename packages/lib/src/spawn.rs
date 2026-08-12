use std::ptr::NonNull;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, mpsc};

use js_sys::{Function, Promise};
use wasm_bindgen::{JsCast, JsValue};

use crate::util::{BoxClosure, DispatchPayload, DispatchSender, SpawnError, DispatchReceiver, SignalReceiver, SignalSender};
use crate::binding::{self, js_arg_vec, WasmBindgenExport____unsafe_pistonite_wbgspawn_poll_signal, WebAssembly__Memory};
use crate::JoinHandle;



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
/// use wasm_bindgen_spawn::ThreadCreator;
///
/// let thread_creator = ThreadCreator::unready("pkg/your_package_bg.wasm", "pkg/your_package.js");
/// // on error, this is a JsValue error
/// assert!(thread_creator.is_ok());
/// ```
///
/// # Dispatcher ready
/// Note that the function to create the Thread Creator is called `unready` rather than `new`.
/// This is because the JS runtime may only start the dispatcher thread after the current
/// execution context is finished. Blocking the thread before the ThreadCreator is ready may
/// cause deadlocks.
///
/// For example, the following code will cause a deadlock, supposed there is a `new` function
/// ```rust,ignore
/// use wasm_bindgen::prelude::*;
/// use wasm_bindgen_spawn::ThreadCreator;
///
/// pub fn will_deadlock() -> Result<(), Box<dyn std::error::Error>> {
///     // the `new` function is hypothetical
///     let thread_creator = ThreadCreator::new("pkg/your_package_bg.wasm", "pkg/your_package.js")?;
///     // calling `spawn` is ok here
///     let thread = thread_creator.spawn(move || {
///         // do some work
///     })?;
///     // this will deadlock because the thread won't be spawned until this synchronous context is
///     // finished
///     thread.join()?;
///
///     Ok(())   
/// }
/// ```
/// The `unready` factory function exists to ensure user calls
/// [`ready`](ThreadCreatorUnready::ready)
/// before start using the `ThreadCreator` to spawn threads. It also has a nice side effect that
/// `ThreadCreator` is now `Send + Sync` since it doesn't need to hold the `Promise`
/// ```no_run
/// use wasm_bindgen::prelude::*;
/// use wasm_bindgen_spawm::ThreadCreator;
///
/// pub async fn will_not_deadlock() -> Result<(), Box<dyn std::error::Error>> {
///     let thread_creator = ThreadCreator::unready("pkg/your_package_bg.wasm", "pkg/your_package.js")?;
///     let thread_creator = thread_creator.ready().await?;
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
/// disable the `async` feature and use [`into_promise_and_inner`](ThreadCreatorUnready::into_promise_and_inner)
/// to avoid depending on `wasm-bindgen-futures`. You need to manually wait for the promise in this
/// case before using the `ThreadCreator` (for example sending the promise to JS and awaiting it there).
/// See the example below for more information.
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
/// use wasm_bindgen_spawn::ThreadCreator;
///
/// thread_local! {
///     static THREAD_CREATOR: OnceCell<ThreadCreator> = OnceCell::new();
/// }
///
/// #[wasm_bindgen]
/// pub fn create_thread_creator() -> Result<Promise, JsValue> {
///     let thread_creator = ThreadCreator::unready("pkg/your_package_bg.wasm", "pkg/your_package.js")?;
///     let (promise, thread_creator) = thread_creator.into_promise_and_inner();
///     THREAD_CREATOR.with(move |tc| {
///         tc.set(thread_creator);
///     });
///     Ok(promise)
///     // the promise can then be awaited in JS (this is useful if the rest
///     // of your code doesn't need wasm-bindgen-futures)
/// }
///
///
/// // On JS side, make sure this function is only called after the promise is resolved.
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
#[derive(Clone)]
pub struct ThreadCreator {
    /// Id for the next thread
    next_id: Arc<AtomicUsize>,
    /// Sender to send the thread closure to the dispatcher for creating threads
    send: DispatchSender,
}
static_assertions::assert_impl_all!(ThreadCreator: Send, Sync);

/// See [`ThreadCreator`] for more information
pub struct ThreadCreatorUnready {
    thread_creator: ThreadCreator,
    /// Promise for if the dispatcher is ready
    dispatcher_promise: Promise,
}

impl ThreadCreatorUnready {

    /// Await the dispatcher to be ready.
    ///
    /// See the struct documentation for [`ThreadCreator`] for more information
    pub async fn ready(self) -> Result<ThreadCreator, JsValue> {
        self.dispatcher_promise.await?;
        Ok(self.thread_creator)
    }

    /// Returns the promise that resolves when the dispatcher is ready,
    /// and the inner [`ThreadCreator`]. Note that the inner creator
    /// can only be used after awaiting on the Promise.
    ///
    /// In async context, it might be more convenient to use [`ready`](ThreadCreatorUnready::ready)
    /// instead
    ///
    /// See the struct documentation for [`ThreadCreator`] for more information
    pub fn into_promise_and_inner(self) -> (Promise, ThreadCreator) {
        (self.dispatcher_promise, self.thread_creator)
    }
}

impl ThreadCreator {
    /// Create a Web Worker to dispatch threads with the wasm module url and the
    /// wasm_bindgen JS url. This dispatcher may not be ready until `ready` is awaited.
    ///
    /// See the [struct documentation](ThreadCreator) for more information
    pub fn unready(wasm_url: &str, wbg_url: &str) -> Result<ThreadCreatorUnready, JsValue> {
        // this function is implemented in dispatcher/src/create.ts
        let create_dispatcher =
            Function::new_with_args("ARGS", include_str!("dispatcher.js"));
        let (send, recv) = mpsc::channel::<DispatchPayload>();
        let (signal_send, signal_recv) = oneshot::channel::<()>();

        type ThreadCreatorArgs = Vec<JsValue>;
        let creator_args = js_arg_vec!{
            [
                wasm_url: &str = wasm_url,
                wbg_url: &str = wbg_url,
                memory: WebAssembly__Memory = binding::get_wasm_memory(),
                recv_ptr: NonNull<DispatchReceiver> = binding::into_js(recv),
                dispatcher_start_signal_send_ptr: NonNull<SignalSender> = binding::into_js(signal_send),
                dispatcher_start_signal_recv_ptr: NonNull<SignalReceiver> = binding::into_js(signal_recv),
                poll_signal_fn: WasmBindgenExport____unsafe_pistonite_wbgspawn_poll_signal = binding::get_poll_signal_fn(),
            ] as ThreadCreatorArgs
        };

        // create the dispatcher
        let promise = create_dispatcher
            .call1(
                &JsValue::null(),
                &JsValue::from(creator_args),
            )?
            .dyn_into::<Promise>()?;
        Ok(ThreadCreatorUnready {
            thread_creator: Self {
                next_id: Arc::new(AtomicUsize::new(1)),
                send,
            },
            dispatcher_promise: promise,
        })
    }
    /// Spawn a new thread to execute F. Note that spawning a new thread is very 
    /// slow, as it requires spinning up a new WebWorker. Pool the threads if you can.
    ///
    /// Similar to [`std::thread::spawn`], this function may panic if the thread creation fails.
    /// In this case it means the web worker for dispatching the threads has unexpectedly
    /// terminated.
    ///
    /// Unlike the Std library, there is no `Builder` type - use [`try_spawn`](Self::try_spawn)
    /// as the recoverable version
    pub fn spawn<F, T>(&self, f: F) -> JoinHandle<T>
    where
        F: FnOnce() -> T + Send + 'static,
        T: Send + 'static,
    {
        match self.try_spawn(f) {
            Ok(x) => x,
            Err(e) => panic!("{e}")
        }
    }

    /// Spawn a new thread to execute F. Note that spawning a new thread is very 
    /// slow, as it requires spinning up a new WebWorker. Pool the threads if you can.
    pub fn try_spawn<F, T>(&self, f: F) -> Result<JoinHandle<T>, SpawnError>
    where
        F: FnOnce() -> T + Send + 'static,
        T: Send + 'static,
    {
        let f_boxed: BoxClosure = 
        Box::new(move || {
            Box::new(f()).into()
        });
        let next_id = self
            .next_id
            .fetch_add(1, Ordering::Relaxed);
        let (send, recv) = oneshot::channel();
        self.send
            .send((f_boxed, send))
            .map_err(|_| SpawnError::Disconnected)?;
        Ok(JoinHandle::new(next_id, recv))
    }
}
