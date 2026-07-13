#[cfg(panic="unwind")]
use std::any::Any;
use std::marker::PhantomData;

use crate::util::{Value, ValueReceiver};


/// Handle for joining a thread
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
    /// Join the thread. Block the current thread until the thread is finished.
    /// Returns the value returned by the thread closure.
    ///
    /// # Note about panicking
    /// If `panic=unwind`, the thread's panic is caught in `Err` and it can be handled
    /// similar to [`std::thread::Result`](https://doc.rust-lang.org/std/thread/type.Result.html).
    ///
    /// If `panic=abort`, or `panic=unwind` and a hard panic happened, this function panics
    /// and the WASM instance maybe left in an inconsistent state and should not be used anymore.
    ///
    /// For more information about panics, please see the crate README.
    #[cfg(panic="unwind")]
    pub fn join(self) -> Result<T, Box<dyn Any + Send + 'static>> {
        // recv() will only error if somehow the thread terminated without sending a value

        use crate::util::WorkerPanic;
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
                panic!("thread {} unrecoverably panicked!", self.id);
            }
        };
        // safety: join handle created in spawn should have the same type T
        let value: Box<T> = unsafe { value.into_box_unchecked() };
        Ok(*value)
    }

    /// Join the thread. Block the current thread until the thread is finished.
    /// Returns the value returned by the thread closure.
    ///
    /// # Note about panicking
    /// If `panic=unwind`, the thread's panic is caught in `Err` and it can be handled
    /// similar to [`std::thread::Result`](https://doc.rust-lang.org/std/thread/type.Result.html).
    ///
    /// If `panic=abort`, or `panic=unwind` and a hard panic happened, this function panics
    /// and the WASM instance maybe left in an inconsistent state and should not be used anymore.
    ///
    /// For more information about panics, please see the crate README.
    #[cfg(not(panic="unwind"))]
    pub fn join(self) -> T {
        // recv() will only error if somehow the thread terminated without sending a value
        let value = match self.recv.recv() {
            Ok(x) => x,
            Err(_) => panic!("thread {} is disconnected", self.id),
        };
        // cast the value back from void* to Box<T>
        let value: ValuePtr = match value {
            Ok(x) => x,
            Err(_) => panic!("thread {} panicked", self.id),
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
