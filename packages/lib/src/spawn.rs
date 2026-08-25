use std::panic::AssertUnwindSafe;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use js_sys::{Function, Promise};
use wasm_bindgen::{JsCast, JsError, JsValue};

use crate::binding;
use crate::binding_constants::{WBG_TARGET_NO_MODULES, WBG_TARGET_WEB};
use crate::join::JoinHandle;
use crate::util::{
    DispatchPayload, DispatchReceiver, DispatchSender, ThreadProc, js_arg_vec, js_type,
    raw_ptr_type,
};

/// Start building a thread dispatcher using the bindgen script from the "no-modules" target.
///
/// See [`ThreadDispatcherInit`]
pub fn init_bg_no_modules(bg_js: JsValue, wasm_module: JsValue) -> ThreadDispatcherInit {
    ThreadDispatcherInit {
        bg_target: WBG_TARGET_NO_MODULES,
        bg_js,
        wasm_module,
    }
}
/// Start building a thread dispatcher using the bindgen script from the "web" target.
///
/// See [`ThreadDispatcherInit`]
pub fn init_bg_web(bg_js: JsValue, wasm_module: JsValue) -> ThreadDispatcherInit {
    ThreadDispatcherInit {
        bg_target: WBG_TARGET_WEB,
        bg_js,
        wasm_module,
    }
}

/// Thread dispatcher initialization.
///
/// The thread dispatcher must be initialized prior to spawning threads. Please
/// refer to [Creating the thread
/// dispatcher](https://wbgspawn.pistonite.dev/basic_example.html#creating-the-thread-dispatcher) in the book.
///
/// ## Terminating the thread dispatcher
/// Having the thread dispatcher alive will keep the JS Event Loop alive, which will prevent
/// non-browser runtimes such as NodeJS from exiting. In this case you need to manually call
/// [`wasm_bindgen_spawn::terminate_dispatcher`](crate::terminate_dispatcher) to drop
/// the thread dispatcher which in turn causes the dispatcher worker to terminate.
#[must_use = "This is the builder and the thread dispatcher is not created until you call create_dispatcher() or create_dispatcher_promise() and wait on the future/promise"]
pub struct ThreadDispatcherInit {
    /// Target enum for wasm_bindgen, used to determine how the bindgen JS
    /// should be preprocessed
    bg_target: u32,

    /// The bindgen source code, storing it as JsValue since
    /// this ultimately needs to be passed to the JS side.
    /// If it's passed from the JS side then we save some encoding/decoding cost
    bg_js: JsValue,

    /// wasm module to be passed to initSync
    wasm_module: JsValue,
}
impl ThreadDispatcherInit {
    /// The same as [`create_dispatcher`](Self::create_dispatcher) but wraps the Rust future
    /// in a JS Promise, which can then be sent back to the JS side and `await`-ed.
    ///
    /// This is useful if your project does not use async Rust at all in other places
    /// and you don't want to add `wasm-bindgen-futures` as a dependency.
    ///
    /// Note internally this still uses the async runtime
    /// provided by `wasm-bindgen-futures` (now `js_sys::futures`) which is what the
    /// `#[wasm_bindgen]` macro uses under the hood for async functions.
    pub fn create_dispatcher_promise(self) -> Promise {
        js_sys::futures::future_to_promise(AssertUnwindSafe(async move {
            self.create_dispatcher().await?;
            Ok(JsValue::undefined())
        }))
    }

    /// Spawn the dispatcher worker and wait for it to become ready
    ///
    /// If a JS exception occurs, it is returned as an `Err`.
    ///
    /// # Panics
    /// Panics if the dispatcher is already initialized. Note you only need to
    /// initialize the dispatcher once across the shared memory instance. You don't need
    /// to initialize it in each thread.
    pub async fn create_dispatcher(self) -> Result<(), JsValue> {
        // we want to be pretty loud since the user should not initialize the thread creator more
        // than once in one shared memory instance. Since the memory is shared, all
        // threads can access the dispatcher at the same time (since it is itself just a
        // tokio::sync::mpsc Sender)
        {
            let dispatcher_guard = DISPATCHER.lock().expect("cannot lock the dispatcher");
            if dispatcher_guard.is_some() {
                drop(dispatcher_guard);
                panic!("{DISPATCHER_ALREADY_INIT_WARNING}");
            }
        }
        // this function is implemented in dispatcher/src/create.ts
        let create_dispatcher = Function::new_with_args("ARGS", include_str!("dispatcher.js"));
        let (send, recv) = tokio::sync::mpsc::unbounded_channel::<DispatchPayload>();
        let (signal_send, signal_recv) = oneshot::channel::<()>();
        let signal_recv = AssertUnwindSafe(signal_recv);

        let creator_args = js_arg_vec! {
            [
                bg_target: js_type!(number) = self.bg_target.into(),
                bg_js: js_type!(string) = self.bg_js,
                wasm_module: js_type!(OpaqueWebAssemblyModule | BufferSource) = self.wasm_module,
                memory: js_type!(WebAssembly.Memory) = wasm_bindgen::memory(),
                recv_ptr: *mut DispatchReceiver = binding::into_js(recv),
                dispatcher_start_signal_send_ptr: raw_ptr_type!(SignalSender) = signal_send.into_raw(),
            ] as ThreadCreatorArgs
        };

        // create the dispatcher
        let _ = create_dispatcher
            .call1(&JsValue::null(), &JsValue::from(creator_args))?
            .dyn_into::<Promise>()?
            .await?;

        // TODO we should be able to just use the async oneshot receiver here

        // we need to poll the signal to ensure the postMessage
        // has fired and the dispatcher is now blocked on waiting for spawn requests.
        // Otherwise, this context can be blocked by caller and dispatcher never
        // receives the initialize message

        // yield to the JS Runtime so it can process the worker creation, etc.
        // It is implementation-dependent if Worker can start execution immediately
        // or after the current context. Currently all mainstream implementation
        // only start the Worker after the current context is done. This means
        // we will most likely have to wait at least once
        let yield_fn = Function::new_no_args("return new Promise(r=>setTimeout(r,0))");
        yield_fn
            .call0(&JsValue::null())?
            .dyn_into::<Promise>()?
            .await?;
        loop {
            match signal_recv.try_recv() {
                Err(oneshot::TryRecvError::Empty) => {
                    yield_fn
                        .call0(&JsValue::null())?
                        .dyn_into::<Promise>()?
                        .await?;
                }
                Err(oneshot::TryRecvError::Disconnected) => {
                    return Err(JsError::new(
                        "The wasm-bindgen-spawn thread dispatcher disconnected!",
                    )
                    .into());
                }
                _ => break,
            }
        }
        {
            let mut dispatcher_guard = DISPATCHER.lock().expect("cannot lock the dispatcher");
            if dispatcher_guard.is_some() {
                drop(dispatcher_guard);
                panic!("{DISPATCHER_ALREADY_INIT_WARNING}");
            }
            *dispatcher_guard = Some(send);
        }

        Ok(())
    }
}

static NEXT_THREAD_ID: AtomicUsize = AtomicUsize::new(1);
static DISPATCHER: Mutex<Option<DispatchSender>> = Mutex::new(None);
static DISPATCHER_ALREADY_INIT_WARNING: &str = "The wasm-bindgen-spawn thread dispatcher is already initialized! The dispatcher is a global, in the shared memory, not a thread-local, so all threads have access to it and you do not need to initialize it per-thread";

/// Spawn a new thread similar to [`std::thread::spawn`]
///
/// Conceptually, the new thread will start executing immediately without the need to yield
/// to the JS Event Loop, meaning the spawning thread can block immediately after calling `spawn`
/// to join the spawned thread without causing dead locks.
///
/// The closure `f` will be executed synchronously in the worker's context. When `f` finishes
/// (or panics), the worker is terminated. This means any promise/futures scheduled onto the JS Event
/// Loop will not run and attempting to `await` them inside the thread
/// will cause a dead lock. If you need to spawn a worker thread and run asynchronous JS (e.g. via `js_sys` or `web_sys`),
/// use [`spawn_async`] to run the Rust thread co-operatively with the JS event loop.
///
/// # Panics
/// Similar to [`std::thread::spawn`], this function may panic if the thread creation fails,
/// including if the thread dispatcher has not been initialized (see [`ThreadDispatcherInit`]).
/// Use [`try_spawn`] as the recoverable version.
#[inline(always)]
pub fn spawn<F, T>(f: F) -> JoinHandle<T>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    match try_spawn(f) {
        Ok(x) => x,
        Err(e) => panic!("Failed to spawn thread with wasm-bindgen-spawn: {e}"),
    }
}

/// Same as [`spawn`] but captures thread creation failure.
#[inline(always)]
pub fn try_spawn<F, T>(f: F) -> Result<JoinHandle<T>, SpawnError>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    // assert unwind safety here only to work around wasm_bindgen's
    // requirement that anything crossing JS-Rust boundary needs to be unwind safe.
    // See ThreadProc for explanation of the unwind safety model
    let f_boxed: ThreadProc = Box::new(move || {
        // execute the main function to create the value
        let value = f();
        // wrap the future to return the boxed value with type erased
        let wrapped_f = std::future::ready(Box::new(value).into());
        // return the wrapped future pinned to satisfy the type
        Box::pin(wrapped_f)
    });
    spawn_impl(f_boxed)
}

/// Spawn a new thread that runs co-operatively with the JS event loop.
///
/// Unlike [`spawn`], you can run asynchronous JS (e.g. with `js_sys` or `web_sys`)
/// inside the thread and `await` it.
///
/// Note that this function does not directly take a future, but rather takes a closure
/// that returns a future. This is because while the closure needs to be `Send`, the future
/// does not. For more information, please refer to [`Send` bounds](https://wbgspawn.pistonite.dev/async.html#send-bounds) in the book.
///
/// Conceptually, the new thread will start executing immediately without the need to yield
/// to the JS Event Loop, meaning the spawning thread can block immediately after calling
/// `spawn_async` to join the spawned thread without causing dead locks.
///
/// # Panics
/// Similar to [`std::thread::spawn`], this function may panic if the thread creation fails,
/// including if the thread dispatcher has not been initialized (see [`ThreadDispatcherInit`]).
/// Use [`try_spawn_async`] as the recoverable version.
#[inline(always)]
pub fn spawn_async<TFn, TFuture, T>(f: TFn) -> JoinHandle<T>
where
    TFn: FnOnce() -> TFuture + Send + 'static,
    TFuture: Future<Output = T> + 'static,
    T: Send + 'static,
{
    match try_spawn_async(f) {
        Ok(x) => x,
        Err(e) => panic!("Failed to spawn thread with wasm-bindgen-spawn: {e}"),
    }
}

/// Same as [`spawn_async`] but captures thread creation failure.
#[inline(always)]
pub fn try_spawn_async<TFn, TFuture, T>(f: TFn) -> Result<JoinHandle<T>, SpawnError>
where
    TFn: FnOnce() -> TFuture + Send + 'static,
    TFuture: Future<Output = T> + 'static,
    T: Send + 'static,
{
    // assert unwind safety here only to work around wasm_bindgen's
    // requirement that anything crossing JS-Rust boundary needs to be unwind safe.
    // See ThreadProc for explanation of the unwind safety model
    let f_boxed: ThreadProc = Box::new(move || {
        // execute the main function to create the future
        let fut = f();
        // wrap the future to return the boxed value with type erased
        let wrapped_f = async move {
            let value = fut.await;
            Box::new(value).into()
        };
        // return the wrapped future pinned to satisfy the type
        Box::pin(wrapped_f)
    });
    spawn_impl(f_boxed)
}

/// Spawn a new thread to execute the thread proc.
fn spawn_impl<T>(f: ThreadProc) -> Result<JoinHandle<T>, SpawnError>
where
    T: Send + 'static,
{
    let dispatcher = {
        let dispatcher = match DISPATCHER.lock() {
            Err(_) => {
                return Err(SpawnError::DispatcherPoisoned);
            }
            Ok(x) => x,
        };
        let Some(dispatcher) = &*dispatcher else {
            return Err(SpawnError::NotInit);
        };
        dispatcher.clone()
    };

    let next_id = NEXT_THREAD_ID.fetch_add(1, Ordering::Relaxed);
    let (send, recv) = oneshot::channel();
    dispatcher
        .send((f, send))
        .map_err(|_| SpawnError::Disconnected)?;
    Ok(JoinHandle::new(next_id, recv))
}

/// Thread creation error returned by [`try_spawn`] or [`try_spawn_async`]
#[derive(Debug, thiserror::Error)]
pub enum SpawnError {
    /// The thread dispatcher is not initialized
    #[error(
        "The wasm-bindgen-spawn thread dispatcher was not initialized. You must call one of the wasm_bindgen_spawn::init_bg_* functions before spawning threads"
    )]
    NotInit,
    /// The thread dispatcher is poisoned because a panic is observed while spawning a thread
    #[error("The wasm-bindgen-spawn thread dispatcher was poisoned.")]
    DispatcherPoisoned,
    /// The thread dispatcher is unexpectedly disconnected
    #[error("The wasm-bindgen-spawn thread dispatcher has disconnected")]
    Disconnected,
}

/// Terminate the thread dispatcher worker
///
/// This is useful in native JS runtimes such as NodeJS to manually uninitialize and finalize
/// the threading system to allow the program to terminate, since JS engines will not terminate
/// unless the event loop is exhausted, which will not happen unless all workers are terminated.
///
/// It's generally NOT recommended to call this unless all threads have been joined. The dispatcher
/// is responsible for recovering from hard aborts (even when `panic=unwind`). After the dispatcher
/// is terminated, threads that complete successfully or whose panics are caught with `catch_unwind`
/// can still be `join`-ed, but threads that hard panicked may hang.
///
/// After termination, attempts to `spawn` new threads will panic (or return `Err` when using the `try_` variants).
pub fn terminate_dispatcher() {
    if let Ok(mut dispatcher) = DISPATCHER.lock() {
        // drop the send handle will unblock the dispatcher. the dispatcher sees there's no more
        // threads coming and will terminate the worker.
        *dispatcher = None;
    }
}
