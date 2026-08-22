use std::any::Any;
use std::marker::PhantomData;
use std::pin::Pin;
use std::task::{Context, Poll};

use crate::util::{Value, ValueReceiver, ValueReceiverAsync, WorkerPanic, WorkerResult};

/// Handle for joining a thread
///
/// This can be used as a drop-in replacement for [`std::thread::JoinHandle`]
/// as long as you are not calling `.thread()` (which currently doesn't have a good use case -
/// if you do have one please open an issue on GitHub).
///
/// JoinHandle also implements [`IntoFuture`](std::future::IntoFuture) so you can join a thread
/// asynchronously by `await`-ing it.
pub struct JoinHandle<T: Send + 'static> {
    id: usize,
    recv: ValueReceiver,
    _marker: PhantomData<T>,
}

impl<T: Send + 'static> JoinHandle<T> {
    pub(crate) fn new(id: usize, recv: ValueReceiver) -> Self {
        Self {
            id,
            recv,
            _marker: PhantomData,
        }
    }

    /// Block the current thread until the thread is finished.
    /// Returns the value returned by the threads' main closure/future.
    ///
    /// This function should behave similarly to [`std::thread::JoinHandle::join`]
    ///
    /// To asynchronously join the thread you can `await` the join handle instead of calling
    /// `.join()`.
    ///
    /// # Note about panicking
    /// If `panic=abort`, the panic will still be caught and this function will return
    /// `Err` with a generic message, instead of triggering another panic.
    ///
    /// For more information on unwind and catching panics, see the [wasm-bindgen book](https://wasm-bindgen.github.io/wasm-bindgen/reference/catch-unwind.html)
    /// or the crate's README.
    pub fn join(self) -> Result<T, Box<dyn Any + Send + 'static>> {
        handle_join_result(self.id, self.recv.0.recv())
    }

    /// Check if the thread has finished executing, or panicked.
    /// This can be used to implement non-blocking join.
    pub fn is_finished(&self) -> bool {
        self.recv.has_message() || self.recv.is_closed()
    }
}

#[doc(hidden)]
pub struct AsyncJoinHandle<T: Send + 'static> {
    id: usize,
    recv: ValueReceiverAsync,
    _marker: PhantomData<T>,
}

impl<T: Send + 'static> IntoFuture for JoinHandle<T> {
    type Output = Result<T, Box<dyn Any + Send + 'static>>;
    type IntoFuture = AsyncJoinHandle<T>;

    fn into_future(self) -> Self::IntoFuture {
        AsyncJoinHandle {
            id: self.id,
            recv: self.recv.0.into_future(),
            _marker: PhantomData,
        }
    }
}

impl<T: Send + 'static> Future for AsyncJoinHandle<T> {
    type Output = Result<T, Box<dyn Any + Send + 'static>>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let id = self.id;
        // safety: recv is pinned while self is
        let recv = unsafe { self.map_unchecked_mut(|s| &mut s.recv) };
        match recv.poll(cx) {
            Poll::Ready(x) => Poll::Ready(handle_join_result(id, x)),
            Poll::Pending => Poll::Pending,
        }
    }
}

fn handle_join_result<T>(
    id: usize,
    result: Result<WorkerResult, oneshot::RecvError>,
) -> Result<T, Box<dyn Any + Send + 'static>> {
    // recv() will only error if somehow the thread terminated without sending a value
    let result = match result {
        Ok(x) => x,
        Err(_) => return Err(Box::new(format!("thread {id} is disconnected"))),
    };
    // cast the value back from void* to Box<T>
    let value: Value = match result {
        Ok(x) => x,
        Err(WorkerPanic { payload: Some(e) }) => {
            return Err(e);
        }
        Err(WorkerPanic { payload: None }) => {
            if cfg!(panic = "unwind") {
                // see https://wasm-bindgen.github.io/wasm-bindgen/reference/handling-aborts.html
                return Err(Box::new(format!(
                    "thread {id} encountered a non-recoverable hard abort!",
                )));
            }
            return Err(Box::new(format!("thread {id} panicked or aborted!")));
        }
    };
    // safety: join handle created in spawn should have the same type T
    let value: Box<T> = unsafe { value.into_box_unchecked() };
    Ok(*value)
}
