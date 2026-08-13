
use std::ptr::NonNull;

use wasm_bindgen::prelude::*;

use crate::util::{self, BoxClosure, DispatchReceiver, SignalReceiver, SignalSender, ValueSender, WorkerPanic};

#[wasm_bindgen]
extern "C" {
    /// Binding to wasm.memory
    ///
    /// This depends on the `let wasm` generated in wbg's glue JS code
    #[wasm_bindgen(js_name = memory, js_namespace = wasm, thread_local_v2)]
    static MEMORY: JsValue;
    /// Binding to the exported _poll_signal function
    #[wasm_bindgen(js_name = __unsafe_pistonite_wbgspawn_poll_signal, js_namespace = wasm_bindgen, thread_local_v2)]
    static POLL_SIGNAL: JsValue;
}
#[allow(non_camel_case_types)]
pub type WebAssembly__Memory = JsValue;
#[allow(non_camel_case_types)]
pub type WasmBindgenExport____unsafe_pistonite_wbgspawn_poll_signal = JsValue;

/// Get the memory object of the current WASM instance
pub fn get_wasm_memory() -> WebAssembly__Memory {
    // safety: depends on `let wasm` symbol
    MEMORY.with(|x| x.clone())
}

/// Get the _poll_signal function instance in the current WASM instance
pub fn get_poll_signal_fn() -> WasmBindgenExport____unsafe_pistonite_wbgspawn_poll_signal {
    // safety: depends on __unsafe_pistonite_wbgspawn_poll_signal
    POLL_SIGNAL.with(|x| x.clone())
}

/// Helper to generate a binding
///
/// currently the accuracy of the binding is eyeballed but this makes
/// it easier to generate it in the future if someone wants to take a stab
/// at it
macro_rules! js_arg_vec {
    ([ $($arg_name:ident : $arg_type:ty = $arg_rust:expr),* $(,)? ] as $ts_type_name:ident) => {{
        $(
            let $arg_name: $arg_type = $arg_rust;
        )*
        let x: $ts_type_name = vec![ $(
            $arg_name.into(),
        )* ];
        x
    }};
}
pub(crate) use js_arg_vec;

/// Main function of the worker thread
///
/// If this returns normally, the thread's result (value or captured panic in `panic=unwind`)
/// has been sent to the thread's join handle and the sender has been dropped. Any
/// reference to the sender on the JS side becomes dangling. Otherwise,
/// the panic (or hard aborts in `panic=unwind`) is manifested as an JS exception
/// and would be caught by the try-catch on the JS side. In this case,
/// the value sender/receiver should still remain valid in memory despite the panic
/// since those states are internal to this library. the dispatcher who held a reference
/// to the value sender will then report the panic to the join handle.
#[doc(hidden)]
#[wasm_bindgen]
pub fn __pistonite_wbgspawn_worker_main(
    moves_f: NonNull<BoxClosure>, 
    maybe_moves_send: NonNull<ValueSender>,
    moves_start: NonNull<SignalSender>,
) {
    // signal the dispatcher that the worker is now started, and is safe to block
    // safety: the sender is only created in _dispatch_recv, where into_js is called
    __unsafe_pistonite_wbgspawn_send_signal(moves_start);

    // safety: the closure is created in _dispatch_recv where into_js is called
    let f: Box<BoxClosure> = unsafe { from_js(moves_f) };

    let result = if cfg!(panic="unwind") {
        // the UnwindSafe trait does not have additional guarantees,
        // it is only a warning to mark potentially-inconsistent
        // state is not easily observed by caller. The Send trait
        // requirement from spawn already ensures that any owned value
        // is moved to the closure and not observable by the spawner,
        // and shared value is guarded by types like Mutex that has
        // other mechanism (i.e. poisoning) to observe panics.
        // Therefore we have a similar case to std::thread::spawn
        // and is ok to use AssertUnwindSafe here
        let f= std::panic::AssertUnwindSafe(f);
        std::panic::catch_unwind(f).map_err(|e| WorkerPanic { payload: Some(e) })
    } else {
        Ok(f())
    };
    // safety: the value sender/receiver channel is only created
    // in _dispatch_recv, where into_js is called
    let send = unsafe { from_js(maybe_moves_send) };
    // there's not much we can do if the join handle was dropped
    let _ = send.0.send(result);
}

/// Notify the join handle that the worker has unrecoverably (hard) panicked
#[doc(hidden)]
#[wasm_bindgen]
pub fn __pistonite_wbgspawn_worker_send_panic(send: NonNull<ValueSender>) {
    // safety: the value sender/receiver channel is only created
    // in _dispatch_recv, where into_js is called
    let send = unsafe { from_js(send) };
    let _ = send.0.send(Err(WorkerPanic { payload: None }));
}

/// Send a signal
///
/// # Safety
/// Caller must ensure `moves_signal` is obtained from `into_js` somewhere,
/// and the pointer is dangling after calling this function
#[doc(hidden)]
#[wasm_bindgen]
pub fn __unsafe_pistonite_wbgspawn_send_signal(moves_signal: NonNull<SignalSender>) {
    // safety: callers need to guarantee signal is from an into_js call
    let send = unsafe { from_js(moves_signal) };
    let _ = send.0.send(());
}

/// Return true if signal is received; drops the receiver if received
///
/// # Safety
/// Caller must ensure `maybe_moves_signal` is obtained from `into_js` somewhere,
/// and the pointer is dangling after calling this function if and only if
/// this function returns true
#[doc(hidden)]
#[wasm_bindgen]
pub fn __unsafe_pistonite_wbgspawn_poll_signal(maybe_moves_signal: NonNull<SignalReceiver>) -> bool {
    // safety: callers need to guarantee signal is from an into_js call
    if unsafe { maybe_moves_signal.as_ref() }.try_recv().is_ok() {
        // safety: callers need to guarantee signal is from an into_js call
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
pub fn __pistonite_wbgspawn_dispatch_recv(recv: NonNull<DispatchReceiver>) -> Option<DispatchThreadRequest> {
    
    // safety: the dispatcher sender/receiver channel is only created/used
    // in ThreadCreator::unready and dispatcher.ts. ThreadCreator creates
    // the receiver pointer with into_js
    let recv: &DispatchReceiver = unsafe { recv.as_ref() };
    let (closure, sender) = match recv.recv() {
        Ok(v) => v,
        Err(_) => return None,
    };

    // note that f_ptr is double-boxed because a Box<dyn> is a fat pointer
    let (start_send, start_recv) = util::assert_unwind_safe_oneshot_channel::<()>();

    let request = js_arg_vec!{
        [
            f_ptr: NonNull<BoxClosure> = into_js(closure),
            sender_ptr: NonNull<ValueSender> = into_js(sender),
            start_send_ptr: NonNull<SignalSender> = into_js(start_send),
            start_recv_ptr: NonNull<SignalReceiver> = into_js(start_recv),
        ] as DispatchThreadRequest
    };
    Some(request)
}
/// For generating glue in TS
#[doc(hidden)]
pub type DispatchThreadRequest = Vec<JsValue>;


/// Drop the receiver
#[doc(hidden)]
#[wasm_bindgen]
pub fn __pistonite_wbgspawn_dispatch_drop(recv: NonNull<DispatchReceiver>) {
    // safety: the dispatcher sender/receiver channel is only created/used
    // in ThreadCreator::unready and dispatcher.ts. ThreadCreator creates
    // the receiver pointer with into_js
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
