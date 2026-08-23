use std::cell::RefCell;
use std::panic::AssertUnwindSafe;
use std::pin::Pin;
use std::task::{Context, Poll};

use js_sys::Function;
use wasm_bindgen::prelude::*;

use crate::util::{ThreadProc, ValueSender, WorkerPanic, raw_ptr_type};

thread_local! {
    /// The worker thread's runtime.
    ///
    /// Currently, this just holds the pointer to the channel to send the result of the worker.
    static RUNTIME: RefCell<Option<raw_ptr_type!(ValueSender)>> = const { RefCell::new(None) };
    static IS_WORKER: RefCell<bool> = const { RefCell::new(false) };
}

/// Run the thread's main future. Return a JS Promise that should be sent
/// to the JS side and awaited
pub fn thread_main(
    proc: Box<ThreadProc>,
    maybe_moves_sender: raw_ptr_type!(ValueSender),
) -> JsValue {
    // run the synchronous part to get a future
    // if the synchronous part panics, it will raise a JS exception
    // that will be caught in the worker JS code
    let fut = if cfg!(panic = "unwind") {
        match std::panic::catch_unwind(AssertUnwindSafe(proc)) {
            Err(e) => {
                let sender = unsafe { ValueSender::from_raw(maybe_moves_sender) };
                let _ = sender.send(Err(WorkerPanic { payload: Some(e) }));
                return JsValue::undefined();
            }
            Ok(x) => x,
        }
    } else {
        proc()
    };
    // setup the runtime
    RUNTIME.with_borrow_mut(|x| *x = Some(maybe_moves_sender));
    IS_WORKER.with_borrow_mut(|x| *x = true);

    // Enter JS realm
    let promise = js_sys::futures::future_to_promise(AssertUnwindSafe(async move {
        // run the main future locally and handle any panic that happened
        // while driving the main future.
        //
        // It does not handle panics that happen in async tasks spawned
        // that are unrelated to this future. This means it's possible
        // for the .await in the below blocks to never return.
        // For those cases the downstream must call spawn_local from this crate
        // to ensure they connect to the thread's runtime
        let wrapped_fut = LocalTryOrAbort {
            try_or_abort_fn: create_try_or_abort_fn(),
            f: fut,
        };
        let result = wrapped_fut.await;

        // hopefully if we got to this point, there is no observed panic, meaning the value is valid
        if let Some(sender) = RUNTIME.with_borrow_mut(|x| x.take()) {
            let sender = unsafe { ValueSender::from_raw(sender) };
            let _ = sender.send(Ok(result));
        }

        Ok(JsValue::undefined())
    }));

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
    if IS_WORKER.with_borrow(|x| *x) {
        js_sys::futures::spawn_local(LocalTryOrAbort {
            try_or_abort_fn: create_try_or_abort_fn(),
            f: future,
        });
    } else {
        // on the main thread, the try-or-abort is not available,
        // so just pass-through to js_sys
        js_sys::futures::spawn_local(future);
    }
}

/// Adopted from
/// https://github.com/wasm-bindgen/wasm-bindgen/issues/2392#issuecomment-758892311
///
/// Wrap each poll with a JS try-catch AND catch_unwind (if panic=unwind). If either a soft
/// or hard panic is caught, terminate the worker thread. The join handle will then be notified
/// of this panic
struct LocalTryOrAbort<F: ?Sized> {
    try_or_abort_fn: Function,
    f: F,
}
fn create_try_or_abort_fn() -> Function {
    // since we are a library and there's no good way to "include custom JS"
    // directly in the library, we indirect-eval a function with the Function constructor.
    // This unfortunately adds a lot of JS overhead when driving the future.
    // (the inline_js/module attribute in wasm_bindgen could be useful
    // but currently that is not supported for no-modules target)
    Function::new_with_args(
        "x",
        "try{x()}catch{try{globalThis.__pistonite_wbgspawn_worker_terminate(true)}catch(e){console.error(e)}}",
    )
}
impl<F: ?Sized> Future for LocalTryOrAbort<F>
where
    F: Future,
{
    type Output = F::Output;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        // take out the sender, we only put it back to allow sending value
        // if the poll does not panic
        let sender = RUNTIME.with_borrow_mut(|x| x.take());

        let Some(sender) = sender else {
            // do not execute any code if we already panicked/lost the runtime
            return Poll::Pending;
        };

        let try_or_abort_fn = self.try_or_abort_fn.clone();

        // need this wrapper because Closure::borror_mut only takes FnMut and not FnOnce
        let mut poll_f_within_try_catch = Some(|| {
            // safety: fields are pinned while self is
            let f = unsafe { self.map_unchecked_mut(|s| &mut s.f) };
            if cfg!(panic = "unwind") {
                // if this hard aborts it should trigger the global abort hook
                match std::panic::catch_unwind(AssertUnwindSafe(|| f.poll(cx))) {
                    Ok(x) => Ok(x),
                    Err(e) => Err(WorkerPanic { payload: Some(e) }),
                }
            } else {
                // if this hard panics it should trigger the global abort hook
                Ok(f.poll(cx))
            }
        });
        let output = RefCell::new(None);
        let mut poll_closure = AssertUnwindSafe(|| {
            // make sure we first execute the function (which may panic)
            let result = poll_f_within_try_catch.take().unwrap()();
            // .. then borrow the ref cell <- this will not be called if the poll panicked
            *output.borrow_mut() = Some(result);
        });
        let poll_closure_obj = Closure::borrow_mut(&mut poll_closure);

        let _ = try_or_abort_fn.call1(&JsValue::undefined(), poll_closure_obj.as_js_value());
        let result = match output.take() {
            Some(x) => x,
            None => {
                // we hard panicked and the worker should be scheduled to terminate,
                // return pending to never call any code.
                // ideally the runtime should avoid polling us anymore
                return Poll::Pending;
            }
        };
        let poll_output = match result {
            Err(panic) => {
                // if we "soft" panicked, i.e. panic caught by unwind,
                // we will send the panic and still kill this thread
                let send = unsafe { ValueSender::from_raw(sender) };
                let _ = send.send(Err(panic));
                // request soft abort (abort without sending a value again, since the sender is
                // already dropped)
                let abort_fn = Function::new_no_args(
                    "try{globalThis.__pistonite_wbgspawn_worker_terminate(false)}catch(e){console.error(e)}",
                );
                let _ = abort_fn.call0(&JsValue::undefined());
                // never poll the future again
                return Poll::Pending;
            }
            Ok(x) => x,
        };
        // either pending or ready, now we can put the sender back as the thread still has work to
        // do
        RUNTIME.with_borrow_mut(|x| *x = Some(sender));

        poll_output
    }
}
