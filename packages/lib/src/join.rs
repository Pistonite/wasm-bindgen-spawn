use std::any::Any;
use std::marker::PhantomData;

use crate::util::{Value, ValueReceiver, WorkerPanic};


/// Handle for joining a thread
///
/// This can be used as a drop-in replacement for [`std::thread::JoinHandle`]
/// as long as you are not calling `.thread()` (which currently doesn't have a good use case - 
/// if you do have one please open an issue on GitHub).
pub struct JoinHandle<T: Send + 'static> {
    id: usize,
    recv: ValueReceiver,
    _marker: PhantomData<T>,
}

impl<T: Send + 'static> JoinHandle<T> {
    pub(crate) fn new(id: usize, recv: ValueReceiver) -> Self {
        Self {
            id, recv, _marker: PhantomData
        }
    }

    /// Block the current thread until the thread is finished.
    /// Returns the value returned by the closure that was used to spawn the thread.
    ///
    /// This function should expect similar behavior as [`std::thread::JoinHandle::join`]
    ///
    ///
    /// # Note about panicking
    /// If `panic=abort`, the panic will still be caught and this function will return
    /// `Err` with a generic message, instead of triggering another panic.
    ///
    /// For more information on unwind and catching panics, see the [wasm-bindgen book](https://wasm-bindgen.github.io/wasm-bindgen/reference/catch-unwind.html)
    /// or the crate's README.
    pub fn join(self) -> Result<T, Box<dyn Any + Send + 'static>> {
        // recv() will only error if somehow the thread terminated without sending a value
        let value = match self.recv.recv() {
            Ok(x) => x,
            Err(_) => return Err(Box::new(format!("thread {} is disconnected", self.id))),
        };
        // cast the value back from void* to Box<T>
        let value: Value = match value {
            Ok(x) => x,
            Err(WorkerPanic { payload: Some(e) }) => {
                return Err(e);
            }
            Err(WorkerPanic { payload: None }) => {
                if cfg!(panic="unwind") {
                    // please, see https://wasm-bindgen.github.io/wasm-bindgen/reference/handling-aborts.html
                    return Err(Box::new(format!("thread {} encountered a non-recoverable hard abort!", self.id)))
                }
                return Err(Box::new(format!( "thread {} panicked or aborted!", self.id)))
            }
        };
        // safety: join handle created in spawn should have the same type T
        let value: Box<T> = unsafe { value.into_box_unchecked() };
        Ok(*value)
    }

    /// Check if the thread has finished executing, or panicked.
    /// This can be used to implement non-blocking join.
    pub fn is_finished(&self) -> bool {
        self.recv.has_message() || self.recv.is_closed()
    }
}
