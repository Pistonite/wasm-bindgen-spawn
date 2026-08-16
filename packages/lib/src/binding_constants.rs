/// Constant value for the "no-modules" target in wasm_bindgen
pub const WBG_TARGET_NO_MODULES: u32 = 1;
/// Constant value for the "web" target in wasm_bindgen
pub const WBG_TARGET_WEB: u32 = 2;
/// Constant to indicate worker thread is ready
pub const WORKER_MSG_READY: u32 = 1;
/// Constant to indicate worker thread completed execution
pub const WORKER_MSG_SUCCESS: u32 = 0;
/// Constant to indicate worker thread panicked
pub const WORKER_MSG_PANIC: u32 = 2;
