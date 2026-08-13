use std::any::Any;
use std::os::raw::c_void;
use std::panic::AssertUnwindSafe;
use std::sync::mpsc;


pub type WorkerResult = Result<Value, WorkerPanic>;
// boxed closure is just a fat pointer passed to JS and to another web worker,
// and finally passed back to Rust. See _worker_main for unwind safety explanation.
// asserting unwind safety here to workaround wasm_bindgen's limitation
// that anything crossing JS-Rust boundary needs to be Unwindsafe
pub type BoxClosure = AssertUnwindSafe<Box<dyn FnOnce() -> Value + Send + 'static>>;
// value channels are used to send thread return values.
// if one thread panics, the inconsistent state is already
// not easily observable by other threads (see _worker_main in binding.rs)
// so we can assert unwind safety here
pub type ValueSender = AssertUnwindSafe<oneshot::Sender<WorkerResult>>;
pub type ValueReceiver = AssertUnwindSafe<oneshot::Receiver<WorkerResult>>;

pub type DispatchPayload = (BoxClosure, ValueSender);
pub type DispatchSender = mpsc::Sender<DispatchPayload>;
pub type DispatchReceiver = mpsc::Receiver<DispatchPayload>;

// signals are used to synchronize multiple web worker threads,
// panics aren't observable on the other side if one side panics,
// so we will assert unwind safety
pub type SignalSender = AssertUnwindSafe<oneshot::Sender<()>>;
pub type SignalReceiver = AssertUnwindSafe<oneshot::Receiver<()>>;

pub fn assert_unwind_safe_oneshot_channel<T>() -> 
(AssertUnwindSafe<oneshot::Sender<T>>, AssertUnwindSafe<oneshot::Receiver<T>>) {
    let (send, recv) = oneshot::channel();
    (AssertUnwindSafe(send), AssertUnwindSafe(recv))
}

/// Error when joining a thread with a [`JoinHandle`]
#[derive(Debug)]
pub struct WorkerPanic {
    /// The payload of panic from a worker thread
    ///
    /// In `panic=unwind`, there can still be [hard aborts](https://wasm-bindgen.github.io/wasm-bindgen/reference/catch-unwind.html#hard-aborts),
    /// that will have a similar effect as `panic=abort`. In those cases,
    /// the error will be propagated to JS as an exception, and `None`
    /// will be sent to the thread's join handle
    pub payload: Option<Box<dyn Any + Send + 'static>>,
}

/// Error when spawning a thread with [`ThreadCreator::spawn`]
#[derive(Debug, thiserror::Error)]
pub enum SpawnError {
    #[error("Cannot spawn WASM thread because the dispatcher has disconnected")]
    Disconnected,
}

/// Wrapper for a heap allocated value
pub struct Value {
    ptr: *mut c_void,
}
// Value is a temporary reference to the heap-allocated return value
// of a thread. Since we are not touching the underlying value in anyway,
// the raw pointer is just a number that is Send + Sync
unsafe impl Send for Value {}
unsafe impl Sync for Value {}
impl<T> From<Box<T>> for Value {
    fn from(value: Box<T>) -> Self {
        Self {
            ptr: Box::into_raw(value) as *mut c_void
        }
    }
}
impl Value {
    pub unsafe fn into_box_unchecked<T>(self)-> Box<T> {
        unsafe { Box::from_raw(self.ptr as *mut T) }
    }
}
