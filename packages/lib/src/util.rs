use std::any::Any;
use std::panic::AssertUnwindSafe;
use std::pin::Pin;
use std::sync::mpsc;

/// ThreadProc is the "main function" for the thread
///
/// Explanation from outer to inner:
///
/// ## AssertUnwindSafe
/// The wrapper exists to workaround wasm_bindgen's limitation that anything crossing the
/// JS-Rust boundary needs to be UnwindSafe.
///
/// The UnwindSafe trait does not have additional guarantees, it is only a warning to mark
/// potentially-inconsistent state is not easily observed by caller.
///
/// In the threading model, the Send trait requirement from spawn already ensures that any
/// owned value is moved to the thread and not observable by the spawner, and shared value
/// is guarded by types like Mutex that has other mechanism (i.e. poisoning) to observe panics.
/// Therefore we have a similar case to std::thread::spawn which also does not require UnwindSafe
///
/// ## Pin<Box<..>>
/// This is the pattern to box a future, as future may contain stack reference it needs to be
/// pinned.
///
/// ## Why is it a future
/// If the thread's "main function" is sync Rust, the JS Event Loop is blocked
/// for the duration the thread is running. This means the thread essentially cannot
/// do anything async in JS (for example using js_sys/web_sys).
/// While wrapping a Rust async runtime such as tokio will work to drive pure-Rust futures,
/// it will still not allow interop with the JS Event Loop.
///
/// See https://github.com/Pistonite/wasm-bindgen-spawn/issues/7 for related discusstion
///
/// The only solution is for the entire thread's main function to be compiled as a future
/// which can then be driven co-operatively by the JS Event Loop.
/// This will also work for sync main functions - it will just need to be wrapped
/// to return future::ready
pub type ThreadProc = AssertUnwindSafe<Pin<Box<dyn Future<Output = Value> + Send + 'static>>>;
// ThreadProc itself should just be a fat pointer
static_assertions::assert_eq_size!(ThreadProc, [*mut (); 2]);

// value channels are used to send thread return values.
// if one thread panics, the inconsistent state is already
// not easily observable by other threads (see _worker_main in binding.rs)
// so we can assert unwind safety here
pub type WorkerResult = Result<Value, WorkerPanic>;
pub type ValueSender = AssertUnwindSafe<oneshot::Sender<WorkerResult>>;
pub type ValueReceiver = AssertUnwindSafe<oneshot::Receiver<WorkerResult>>;

// the thread dispatch payload is the main function and the channel to send
// the result back
pub type DispatchPayload = (ThreadProc, ValueSender);
pub type DispatchSender = mpsc::Sender<DispatchPayload>;
pub type DispatchReceiver = mpsc::Receiver<DispatchPayload>;

// signals are used to synchronize multiple web worker threads,
// panics aren't observable on the other side if one side panics,
// so we will assert unwind safety
pub type SignalSender = AssertUnwindSafe<oneshot::Sender<()>>;
pub type SignalReceiver = AssertUnwindSafe<oneshot::Receiver<()>>;

pub fn assert_unwind_safe_oneshot_channel<T>() -> (
    AssertUnwindSafe<oneshot::Sender<T>>,
    AssertUnwindSafe<oneshot::Receiver<T>>,
) {
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

/// Wrapper for a heap allocated value
pub struct Value {
    ptr: *mut (),
}
// Value is a temporary reference to the heap-allocated return value
// of a thread. Since we are not touching the underlying value in anyway,
// the raw pointer is just a number that is Send + Sync
unsafe impl Send for Value {}
unsafe impl Sync for Value {}
impl<T> From<Box<T>> for Value {
    fn from(value: Box<T>) -> Self {
        Self {
            ptr: Box::into_raw(value) as *mut (),
        }
    }
}
impl Value {
    pub unsafe fn into_box_unchecked<T>(self) -> Box<T> {
        unsafe { Box::from_raw(self.ptr as *mut T) }
    }
}
