use std::any::Any;
use std::os::raw::c_void;
use std::sync::mpsc;


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

pub type WorkerResult = Result<Value, WorkerPanic>;
pub type BoxClosure = Box<dyn FnOnce() -> Value + Send + 'static>;
pub type ValueSender = oneshot::Sender<WorkerResult>;
pub type ValueReceiver = oneshot::Receiver<WorkerResult>;

pub type DispatchPayload = (BoxClosure, ValueSender);
pub type DispatchSender = mpsc::Sender<DispatchPayload>;
pub type DispatchReceiver = mpsc::Receiver<DispatchPayload>;

pub type SignalSender = oneshot::Sender<()>;
pub type SignalReceiver = oneshot::Receiver<()>;
