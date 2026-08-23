use std::panic::AssertUnwindSafe;

use wasm_bindgen::prelude::*;

use crate::util::{DispatchReceiver, SignalReceiver, SignalSender, ThreadProc, ValueSender, WorkerPanic, js_arg_vec, js_type, raw_ptr_type};


/// Main function of the worker thread
#[doc(hidden)]
#[wasm_bindgen(skip_typescript)]
pub fn __pistonite_wbgspawn_worker_main(
    moves_f: raw_ptr_type!(ThreadProc),
    maybe_moves_send: raw_ptr_type!(ValueSender),
    moves_start: raw_ptr_type!(SignalSender),
) -> js_type!(Promise<void>) {
    // signal the dispatcher that the worker is now started, and is safe to block
    // safety: the sender is only created in _dispatch_recv, where into_js is called
    __unsafe_pistonite_wbgspawn_send_signal(moves_start);

    // safety: the closure is created in spawn where into_js is called
    let f: Box<ThreadProc> = unsafe { from_js(moves_f as *mut ThreadProc) };

    crate::runtime::thread_main(f, maybe_moves_send)
}

/// Send a panic
///
/// # Safety
/// Caller must ensure `moves_send` is obtained by calling `into_raw()` on
/// a `ValueSender`. Also the caller must guarantee to never use the pointer after
/// calling this function.
#[doc(hidden)]
#[wasm_bindgen(skip_typescript)]
pub fn __unsafe_pistonite_wbgspawn_send_panic(moves_send: raw_ptr_type!(ValueSender)) {
    // safety: callers need to guarantee signal is from an into_raw call
    let send = unsafe { ValueSender::from_raw(moves_send) };
    let _ = send.send(Err(WorkerPanic { payload: None }));
}

/// Send a signal
///
/// # Safety
/// Caller must ensure `moves_signal` is obtained by calling `into_raw()` on
/// a `SignalSender`. Also the caller must guarantee to never use the pointer after
/// calling this function.
#[doc(hidden)]
#[wasm_bindgen(skip_typescript)]
pub fn __unsafe_pistonite_wbgspawn_send_signal(moves_signal: raw_ptr_type!(SignalSender)) {
    // safety: callers need to guarantee signal is from an into_raw call
    let send = unsafe { SignalSender::from_raw(moves_signal) };
    let _ = send.send(());
}

/// Poll the signal without blocking.
///
/// # Return
/// - `true` if received and *signal will be dropped*
/// - `false` if not received
/// - `undefined` if disconnected
///
/// # Safety
/// Caller must ensure `maybe_moves_signal` is obtained from calling `into_raw` on a `SignalReceiver`
/// If this function returns `true`, the signal receiver should not be used again.
#[doc(hidden)]
#[wasm_bindgen(skip_typescript)]
pub fn __unsafe_pistonite_wbgspawn_poll_signal(
    maybe_moves_signal: raw_ptr_type!(SignalReceiver),
) -> Option<bool> {
    // safety: callers need to guarantee signal is from an into_js call
    let recv = unsafe { SignalReceiver::from_raw(maybe_moves_signal) };
    let result = recv.try_recv();
    match result {
        Err(oneshot::TryRecvError::Empty) => {
            // leak the receiver again
            let _ = recv.into_raw();
            Some(false)
        }
        Err(oneshot::TryRecvError::Disconnected) => {
            // leak the receiver again
            let _ = recv.into_raw();
            None
        }
        _ => {
            drop(recv);
            Some(true)
        }
    }
}

/// Receive a request to spawn a thread with the dispatcher.
///
/// The receiving is async so the dispatcher can do other tasks to manage
/// already-spawned threads
#[doc(hidden)]
#[wasm_bindgen(skip_typescript)]
pub fn __pistonite_wbgspawn_dispatch_recv(
    borrows_recv: *mut DispatchReceiver,
) -> js_type!(Promise<Option<DispatchThreadRequest>>) {
    js_sys::futures::future_to_promise(AssertUnwindSafe(async move {
        // safety: the dispatcher sender/receiver channel is only created/used
        // in ThreadCreator::unready and dispatcher.ts. ThreadCreator creates
        // the receiver pointer with into_js
        let recv: &mut DispatchReceiver = unsafe { borrows_recv.as_mut().unwrap_unchecked() };
        let (closure, sender) = match recv.recv().await {
            Some(v) => v,
            None => return Ok(JsValue::undefined()),
        };
        
        let (start_send, start_recv) = oneshot::channel::<()>();
        
        let request = js_arg_vec! {
            [
                f_ptr: raw_ptr_type!(ThreadProc) = into_js::<ThreadProc>(closure) as *mut (),
                sender_ptr: raw_ptr_type!(ValueSender) = sender.into_raw(),
                start_send_ptr: raw_ptr_type!(SignalSender) = start_send.into_raw(),
                start_recv_ptr: raw_ptr_type!(SignalReceiver) = start_recv.into_raw(),
            ] as DispatchThreadRequest
        };
        Ok(request.into())
    })).into()
}

/// For generating glue in TS
#[doc(hidden)]
pub type DispatchThreadRequest = Vec<JsValue>;

/// Drop the receiver
#[doc(hidden)]
#[wasm_bindgen(skip_typescript)]
pub fn __pistonite_wbgspawn_dispatch_drop(moves_recv: *mut DispatchReceiver) {
    // safety: the dispatcher sender/receiver channel is only created/used
    // in ThreadCreator::unready and dispatcher.ts. ThreadCreator creates
    // the receiver pointer with into_js
    let recv: Box<DispatchReceiver> = unsafe { from_js(moves_recv) };
    drop(recv);
}

pub fn into_js<T>(value: T) -> *mut T {
    // box the value again so we have a thin pointer that can be passed to JS
    Box::into_raw(Box::new(value))
}

// safety: nonnull_ptr must be one that's returned from into_js, and must not be null
pub unsafe fn from_js<T>(nonnull_ptr: *mut T) -> Box<T> {
    // safety: since nonnull_ptr is returned from into_js it's called with into_raw
    unsafe { Box::from_raw(nonnull_ptr) }
}
