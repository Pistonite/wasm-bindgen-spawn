use std::cell::RefCell;
use std::panic::AssertUnwindSafe;
use std::pin::Pin;
use std::task::{Context, Poll};

use js_sys::Function;
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::Closure;

use crate::binding_constants::{WORKER_MSG_PANIC, WORKER_MSG_SUCCESS};
use crate::util::{ThreadProc, ValueSender, WorkerPanic, WorkerResult};

/// Run the thread's main future. Return a JS Promise that should be sent
/// to the JS side and awaited
///
/// In normal circumstances, the function internally handles sending the result
/// to the join handle and terminating the JS worker. The JS will also
/// attempt to call terminate if the thread runtime fails to do so
/// to avoid leaving a worker idling forever
pub fn thread_main(proc: Box<ThreadProc>, terminate_fn: Function, sender: ValueSender) -> JsValue {
    // setup the runtime
    let terminator = Terminator { terminate_fn };
    let runtime = Runtime { terminator, sender };
    RUNTIME.with_borrow_mut(|x| *x = Some(runtime));

    // Enter JS realm
    let promise = js_sys::futures::future_to_promise(async move {
        // run the main future locally and handle any panic that happened
        // while driving the main future.
        //
        // It does not handle panics that happen in async tasks spawned
        // that are unrelated to this future. This means it's possible
        // for the .await in the below blocks to never return.
        // For those cases the downstream must call spawn_local from this crate
        // to ensure they connect to the thread's runtime
        let wrapped_fut = CatchPanicAndUnwind {
            f: async move {
                // run the synchronous part to get a future
                let fut = proc();
                // run the future
                fut.await
            },
        };
        let result = AssertUnwindSafe(wrapped_fut).await;

        terminate_with_result(result);

        Ok(JsValue::undefined())
    });

    promise.into()
}

/// Schedule a task in the JS Event Loop to drive the rust future.
///
/// This is a wrapper for [`js_sys::futures::spawn_local`] that hooks into
/// the worker thread's runtime to handle any panics in the async task.
/// This version of `spawn_local` will ensure the join handle is notified of the panic
/// and the worker is terminated. Without this wrapper, async panics might
/// leave the main thread's future hang forever.
///
/// In hard aborts when `panic=unwind` or any panic when `panic=abort`, `drop`
/// implementations will not run and will unfortunately leave leaked memory
/// in the underlying shared memory buffer.
pub fn spawn_local<F>(future: F)
where
    F: Future<Output = ()> + 'static,
{
    js_sys::futures::spawn_local(async move {
        let future_wrapped = CatchPanicAndUnwind { f: future };
        if let Err(e) = future_wrapped.await {
            terminate_with_result(Err(e));
        }
    });
}

fn terminate_with_result(result: WorkerResult) {
    let rt = RUNTIME.with_borrow_mut(|x| x.take());
    let Some(rt) = rt else {
        // the runtime is already terminated, perhaps by async task
        return;
    };
    let success = result.is_ok();
    let _ = rt.sender.0.send(result);
    if success {
        rt.terminator.success();
    } else {
        rt.terminator.panic();
    }
}

struct Runtime {
    terminator: Terminator,
    sender: ValueSender,
}
thread_local! {
    static RUNTIME: RefCell<Option<Runtime>> = const { RefCell::new(None) };
}

/// Binding with a JS termination function that accepts a WORKER_MSG
///
/// After calling this it is expected that the JS Engine will kill this thread
/// shortly
struct Terminator {
    terminate_fn: Function,
}
impl Terminator {
    pub fn success(&self) {
        let _ = self
            .terminate_fn
            .call1(&JsValue::undefined(), &WORKER_MSG_SUCCESS.into());
    }
    pub fn panic(&self) {
        let _ = self
            .terminate_fn
            .call1(&JsValue::undefined(), &WORKER_MSG_PANIC.into());
    }
}

/// The TryCatch future implementation is adopted from
/// https://github.com/wasm-bindgen/wasm-bindgen/issues/2392#issuecomment-758892311
///
/// This is similar to catch_unwind in futures-util, except it wraps each poll
/// with a JS try-catch and std::panic::catch_unwind (if panic=unwind)
struct CatchPanicAndUnwind<F: ?Sized> {
    f: F,
}
impl<F: ?Sized> Future for CatchPanicAndUnwind<F>
where
    F: Future,
{
    type Output = Result<F::Output, WorkerPanic>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        // since we are a library and there's no good way to "include custom JS"
        // directly in the library, we indirect-eval a function with the Function constructor.
        // This unfortunately adds a lot of JS overhead when driving the future.
        //
        // we are also creating the function on each poll since the JSValue is not
        // Send/Sync, storing the function will make the enture future not Send
        let try_catch: Function = Function::new_with_args("x", "try{x()}catch{}");
        // need this wrapper because Closure::borror_mut only takes FnMut and not FnOnce
        let mut f = Some(|| {
            // safety: f is pinned while self is
            let f = unsafe { self.map_unchecked_mut(|s| &mut s.f) };
            if cfg!(panic = "unwind") {
                match std::panic::catch_unwind(AssertUnwindSafe(|| f.poll(cx))) {
                    Ok(x) => Ok(x),
                    Err(e) => Err(WorkerPanic { payload: Some(e) }),
                }
            } else {
                Ok(f.poll(cx))
            }
        });
        let o = RefCell::new(None);
        let mut closure = AssertUnwindSafe(|| {
            // make sure we first execute the function (which may panic)
            let result = f.take().unwrap()();
            // .. then borrow the ref cell
            *o.borrow_mut() = Some(result);
        });
        let c = Closure::borrow_mut(&mut closure);
        // ignore the Err, since the function itself is literally a try-catch
        // it's not supposed to throw anyway; even if it does we only care about
        // if we got a value
        let _ = try_catch.call1(&JsValue::undefined(), c.as_js_value());
        match o.take() {
            Some(Ok(Poll::Ready(t))) => Poll::Ready(Ok(t)),
            Some(Ok(Poll::Pending)) => Poll::Pending,
            Some(Err(panic)) => Poll::Ready(Err(panic)),
            None => Poll::Ready(Err(WorkerPanic { payload: None })),
        }
    }
}
