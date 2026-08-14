use std::panic::AssertUnwindSafe;
use std::ptr::NonNull;
use std::sync::{Mutex, OnceLock, mpsc};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use js_sys::{Function, Promise};
use wasm_bindgen::{JsCast, JsError, JsValue};

use crate::join::JoinHandle;
use crate::binding::{self, js_arg_vec, js_type};
use crate::util::{self, DispatchPayload, DispatchSender, DispatchReceiver, SignalSender, BoxClosure};

pub fn init_bg_no_modules(bg_js: JsValue) -> ThreadCreatorInit {
    ThreadCreatorInit { bg_target: binding::WBG_TARGET_NO_MODULES, bg_js }
}
pub fn init_bg_web(bg_js: JsValue) -> ThreadCreatorInit {
    ThreadCreatorInit { bg_target: binding::WBG_TARGET_WEB, bg_js }
}



pub struct ThreadCreatorInit {
    /// Target enum for wasm_bindgen, used to determine how the bindgen JS
    /// should be preprocessed
    bg_target: u32,

    /// The bindgen source code, storing it as JsValue since
    /// this is ultimately needs to be passed to the JS side.
    /// If it's passed from JS side then we save some encoding/decoding cost
    bg_js: JsValue,

}
impl ThreadCreatorInit {
    // /The WebAssembly.Module (compiled wasm code)
    // /If `--target` is not `bundler`, wasm_bindgen provides a Rust
    // /binding directly. Otherwise it must be provided when initializing the ThreadCreator
    // wasm_module: Option<WebAssembly__Module>
    #[cfg(feature = "no-wbg-module")]
    pub fn ready_promise(self, wasm_module: JsValue) -> Promise {
        js_sys::futures::future_to_promise(async move {
            self.ready(wasm_module).await?;
            Ok(JsValue::undefined())
        })
    }

    #[cfg(not(feature = "no-wbg-module"))]
    pub fn ready_promise(self) -> Promise {
        js_sys::futures::future_to_promise(async move {
            self.ready().await?;
            Ok(JsValue::undefined())
        })
    }

    #[cfg(feature = "no-wbg-module")]
    pub async fn ready(self, wasm_module: JsValue) -> Result<(), JsValue> {
        self.ready_impl(wasm_module).await
    }

    #[cfg(not(feature = "no-wbg-module"))]
    pub async fn ready(self) -> Result<(), JsValue> {
        self.ready_impl(wasm_bindgen::module()).await
    }

    async fn ready_impl(self, wasm_module: JsValue) -> Result<(), JsValue> {
        // we want to be pretty loud since user should not initialize the thread creator more
        // than once in one shared memory instance. Since the memory is shared, all
        // threads can access the dispatcher at the same time (since itself is just a
        // std::sync::mpsc Sender
        let mut dispatcher_guard = DISPATCHER.lock().expect("cannot lock the dispatcher");
        if dispatcher_guard.is_some() {
            drop(dispatcher_guard);
            panic!("{DISPATCHER_ALREADY_INIT_WARNING}");
        }
        // this function is implemented in dispatcher/src/create.ts
        let create_dispatcher =
            Function::new_with_args("ARGS", include_str!("dispatcher.js"));
        let (send, recv) = mpsc::channel::<DispatchPayload>();
        let (signal_send, signal_recv) = util::assert_unwind_safe_oneshot_channel::<()>();

        // type alias for generating TypeScript types
        type ThreadCreatorArgs = Vec<JsValue>;
        let creator_args = js_arg_vec!{
            [
                bg_target: js_type!(number) = self.bg_target.into(),
                bg_js: js_type!(string) = self.bg_js,
                wasm_module: js_type!(WebAssembly.Module) = wasm_module,
                memory: js_type!(WebAssembly.Memory) = wasm_bindgen::memory(),
                recv_ptr: NonNull<DispatchReceiver> = binding::into_js(recv),
                dispatcher_start_signal_send_ptr: NonNull<SignalSender> = binding::into_js(signal_send),
            ] as ThreadCreatorArgs
        };

        // create the dispatcher
        let _ = create_dispatcher
            .call1(
                &JsValue::null(),
                &JsValue::from(creator_args),
            )?
            .dyn_into::<Promise>()?.await?;
        // we need to poll the signal to ensure the postMessage
        // has fired and the dispatcher is now blocked on waiting for spawn requests.
        // Otherwise, this context can be blocked by caller and dispatcher never
        // receives the initialize message

        // yield to the JS Runtime so it can process the worker creation, etc.
        // It is implementation-dependent if Worker can start execution immediately
        // or after the current context. Currently all mainstream implementation
        // only start the Worker after the current context is done. This means
        // we will most likely have to wait at least once
        let yield_fn = 
        Function::new_no_args("return new Promise(r=>setTimeout(r,0))");
        yield_fn.call0(&JsValue::null())?.dyn_into::<Promise>()?.await?;
        loop {
            match signal_recv.try_recv() {
                Err(oneshot::TryRecvError::Empty) => {
                    yield_fn.call0(&JsValue::null())?.dyn_into::<Promise>()?.await?;
                }
                Err(oneshot::TryRecvError::Disconnected) => {
                    return Err(JsError::new("The wasm-bindgen-spawn thread dispatcher disconnected!").into());
                }
                _ => break
            }
        }

        *dispatcher_guard = Some(send);

        Ok(())
    }
}

static NEXT_THREAD_ID: AtomicUsize = AtomicUsize::new(1);
// using a OnceLock to prevent multiple threads calling one of the init functions at the same time
// it should be pretty rare though since downstream user would have to either unknowingly
// call init_bg* multiple times somewhere in Rust, or initializing shared memory themselves in multiple workers
// and both call init_bg*
static DISPATCHER: Mutex<Option<DispatchSender>> = Mutex::new(None);
static DISPATCHER_ALREADY_INIT_WARNING: &str = "The wasm-bindgen-spawn thread dispatcher is already initialized! The dispatcher is a global, in the shared memory, not a thread-local, so all threads have access to it and you do not need to initialize it per-thread";

    /// Spawn a new thread to execute F. Note that spawning a new thread is very 
    /// slow, as it requires spinning up a new WebWorker. Pool the threads if you can.
    ///
    /// Similar to [`std::thread::spawn`], this function may panic if the thread creation fails.
    /// In this case it means the web worker for dispatching the threads has unexpectedly
    /// terminated.
    ///
    /// Unlike the Std library, there is no `Builder` type - use [`try_spawn`](Self::try_spawn)
    /// as the recoverable version
    pub fn spawn<F, T>(f: F) -> JoinHandle<T>
    where
        F: FnOnce() -> T + Send + 'static,
        T: Send + 'static,
    {
        match try_spawn(f) {
            Ok(x) => x,
            Err(e) => panic!("Failed to spawn thread with wasm-bindgen-spawn: {e}")
        }
    }

    /// Spawn a new thread to execute F. Note that spawning a new thread is very 
    /// slow, as it requires spinning up a new WebWorker. Pool the threads if you can.
    pub fn try_spawn<F, T>(f: F) -> Result<JoinHandle<T>, SpawnError>
    where
        F: FnOnce() -> T + Send + 'static,
        T: Send + 'static,
    {
    let dispatcher = {
        let dispatcher = match DISPATCHER.lock() {
            Err(_) => {
                return Err(SpawnError::DispatcherPoisoned);
            }
            Ok(x) => x
        };
        let Some(dispatcher) = &*dispatcher else {
            return Err(SpawnError::NotInit);
        };
        dispatcher.clone()
    };

        let f_boxed: BoxClosure = 
        // assert unwind safety here only to work around wasm_bindgen's 
        // requirement that anything crossing JS-Rust boundary needs to be unwind safe.
        // See _worker_main for explanation of how unwind safety works in this model
        // of threading
        AssertUnwindSafe(Box::new(move || {
            Box::new(f()).into()
        }));
        let next_id = NEXT_THREAD_ID
            .fetch_add(1, Ordering::Relaxed);
        let (send, recv) = util::assert_unwind_safe_oneshot_channel();
        dispatcher
            .send((f_boxed, send))
            .map_err(|_| SpawnError::Disconnected)?;
        Ok(JoinHandle::new(next_id, recv))
    }

/// Error when spawning a thread with [`ThreadCreator::spawn`]
#[derive(Debug, thiserror::Error)]
pub enum SpawnError {
    #[error("The wasm-bindgen-spawn thread dispatcher was not initialized. You must call one of the wasm_bindgen_spawn::init_bg_* functions before spawning threads")]
    NotInit,
    #[error("The wasm-bindgen-spawn thread dispatcher was poisoned. This is likely a bug!")]
    DispatcherPoisoned,
    #[error("The wasm-bindgen-spawn thread dispatcher has disconnected")]
    Disconnected,
}

/// Request the thread dispatcher to terminate.
///
/// This is useful in native JS runtimes such as NodeJS to manually uninitialize and finalize
/// the threading system to allow the program to terminate, since JS engines will not terminate
/// unless the event loop has exhausted, which will not happen unless all threads are terminated.
///
/// It's generally NOT recommended to call this unless all threads have been joined. The dispatcher
/// is responsible for recovering from hard aborts (even when `panic=unwind`). After the dispatcher
/// is terminated, threads that complete successfully or whose panics are caught with `catch_unwind`
/// can still be `join`-ed, but threads that hard panicked may hang.
pub fn terminate_dispatcher() {
    if let Ok(mut dispatcher) = DISPATCHER.lock() {
        *dispatcher = None;
    }
}
