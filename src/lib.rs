#![doc = include_str!("../README.md")]

#[cfg(all(target_arch = "wasm32", not(target_feature = "atomics"), not(doc)))]
compile_error!(
    "-Ctarget_feature=atomics is not enabled. Please read the README and set the right rustflags"
);

#[cfg(all(target_arch = "wasm32", not(panic = "unwind"), not(doc)))]
compile_error!(
"panic=unwind is widely supported"
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
    #[wasm_bindgen(js_name = memory, js_namespace = wasm, thread_local_v2)]
    static MEMORY: JsValue;
    #[wasm_bindgen(js_name = __dispatch_poll_worker, js_namespace = wasm_bindgen, thread_local_v2)]
    static DISPATCH_POLL_WORKER: JsValue;
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

/// Send a start signal to indicate the dispatcher is ready
#[doc(hidden)]
#[wasm_bindgen]
pub fn __dispatch_start(start: NonNull<SignalSender>) {
    let start_ptr = start.as_ptr();
    let start = unsafe { Box::from_raw(start_ptr) };
    let _ = start.send(());
}

/// Receive a request to spawn a thread with the dispatcher.
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

/// Return true if the spawned thread has started and the dispatcher
/// could start blocking for waiting for new spawn requests
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

/// Drop the receiver
#[doc(hidden)]
#[wasm_bindgen]
pub fn __dispatch_drop(recv: NonNull<DispatchReceiver>) {
    let recv: Box<DispatchReceiver> = unsafe { Box::from_raw(recv.as_ptr()) };
    drop(recv);
}
