
use std::ptr::NonNull;

use wasm_bindgen::prelude::*;

use crate::util::{BoxClosure, DispatchReceiver, SignalReceiver, SignalSender, ValueSender, WorkerPanic, WorkerResult};

#[wasm_bindgen]
extern "C" {
    /// Binding to wasm.memory
    #[wasm_bindgen(js_name = memory, js_namespace = wasm, thread_local_v2)]
    static MEMORY: JsValue;
    #[wasm_bindgen(js_name = __poll_signal, js_namespace = wasm_bindgen, thread_local_v2)]
    static POLL_SIGNAL: JsValue;
}

/// Get the memory object of the current WASM instance
pub fn get_wasm_memory() -> JsValue {
    MEMORY.with(|x| x.clone())
}

/// Get the __poll_signal function instance in the current WASM instance
pub fn get_poll_signal_fn() -> JsValue {
    POLL_SIGNAL.with(|x| x.clone())
}

/// Main function of the worker thread
///
/// ## Return
/// Return a value if one needs to be sent to the value receiver (the join handle).
/// If a value is returned then `maybe_moves_send` has not been consumed yet, otherwise
/// it is already consumed.
#[cfg(panic="unwind")]
#[doc(hidden)]
#[wasm_bindgen]
pub fn __worker_main(
    moves_f: NonNull<BoxClosure>, 
    moves_start: NonNull<SignalSender>,
) -> NonNull<WorkerResult> {
    // signal the dispatcher that the worker is now started, and is safe to block
    __send_signal(moves_start);
    // safety: into_js(closure) in __dispatcher_recv
    let f: Box<BoxClosure> = unsafe { from_js(moves_f) };
    let result = std::panic::catch_unwind(f).map_err(|e| WorkerPanic { payload: Some(e) });
    into_js(result)
}
#[cfg(not(panic="unwind"))]
#[doc(hidden)]
#[wasm_bindgen]
pub fn __worker_main(
    moves_f: NonNull<BoxClosure>, 
    moves_start: NonNull<SignalSender>,
) -> NonNull<WorkerResult> {
    // signal the dispatcher that the worker is now started, and is safe to block
    __send_signal(moves_start);
    // safety: into_js(closure) in __dispatcher_recv
    let f: Box<BoxClosure> = unsafe { from_js(moves_f) };
    // if f panics, it will probably trigger unreachable instruction
    // and propagate the error to JS
    let value = f();
    return into_js(Ok(value));
}

/// Send value or hard panic to receiver
#[doc(hidden)]
#[wasm_bindgen]
pub fn __worker_send(send: NonNull<ValueSender>, value: Option<NonNull<WorkerResult>>) {
    // safety: into_js(sender) in __dispatch_recv
    let send = unsafe { from_js(send) };
    match value {
        None => {
            let _ = send.send(Err(WorkerPanic { payload: None }));
        }
        Some(result) => {
            // safety: into_js in __worker_main
            let result = unsafe { from_js(result) };
            let _ = send.send(*result);
        }
    }
}

/// Send a start signal to indicate the dispatcher is ready
#[doc(hidden)]
#[wasm_bindgen]
pub fn __send_signal(moves_signal: NonNull<SignalSender>) {
    let send = unsafe { from_js(moves_signal) };
    let _ = send.send(());
}

/// Return true if signal is received; drops the receiver if received
#[doc(hidden)]
#[wasm_bindgen]
pub fn __poll_signal(maybe_moves_signal: NonNull<SignalReceiver>) -> bool {
    if unsafe { maybe_moves_signal.as_ref() }.try_recv().is_ok() {
        let recv = unsafe { from_js(maybe_moves_signal) };
        drop(recv);
        true
    } else {
        false
    }
}

/// Receive a request to spawn a thread with the dispatcher.
#[doc(hidden)]
#[wasm_bindgen]
pub fn __dispatch_recv(recv: NonNull<DispatchReceiver>) -> Option<Vec<JsValue>> {
    // cast as reference so we don't drop it
    // safety: binding::into_js(recv) in spawn.rs: ThreadCreator::unready
    let recv: &DispatchReceiver = unsafe { recv.as_ref() };
    let (closure, sender) = match recv.recv() {
        Ok(v) => v,
        Err(_) => return None,
    };
    let sender_ptr = into_js(sender);
    let (start_send, start_recv) = oneshot::channel::<()>();
    let start_send_ptr = into_js(start_send);
    let start_recv_ptr = into_js(start_recv);

    // note that f_ptr is double-boxed because a Box<dyn> is a fat pointer
    let f_ptr: NonNull<BoxClosure> = into_js(closure);
    let value_vec = vec![
        f_ptr.into(),
        sender_ptr.into(),
        start_send_ptr.into(),
        start_recv_ptr.into(),
    ];
    Some(value_vec)
}


/// Drop the receiver
#[doc(hidden)]
#[wasm_bindgen]
pub fn __dispatch_drop(recv: NonNull<DispatchReceiver>) {
    let recv: Box<DispatchReceiver> = unsafe { Box::from_raw(recv.as_ptr()) };
    drop(recv);
}

pub fn into_js<T>(value: T) -> NonNull<T> {
    // box the value again so we have a thin pointer that can be passed to JS
    let ptr: *mut T = Box::into_raw(Box::new(value));
    // safety: Box is never null
    unsafe { NonNull::new_unchecked(ptr) }
}

// safety: nonnull_ptr must be one that's returned from into_js
pub unsafe fn from_js<T>(nonnull_ptr: NonNull<T>) -> Box<T> {
    let ptr = nonnull_ptr.as_ptr();
    // safety: since nonnull_ptr is returned from into_js it's called with into_raw
    unsafe { Box::from_raw(ptr) }
}
