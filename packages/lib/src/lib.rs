//! ![Version Badge](https://img.shields.io/crates/v/wasm-bindgen-spawn)
//! ![License Badge](https://img.shields.io/github/license/Pistonite/wasm-bindgen-spawn)
//! ![Issue Badge](https://img.shields.io/github/issues/Pistonite/wasm-bindgen-spawn)
//!
//! A Worker based multithreading library for Rust and WebAssembly.
//!
//! This uses the WebAssembly [threads proposal](https://github.com/WebAssembly/threads/blob/master/proposals/threads/Overview.md)
//! and shared memory to communicate between workers (once they are started), instead of `postMessage`.
//! The threads proposal is currently in [phase 4](https://webassembly.org/features/) and available in all major browsers and runtimes.
//!
//! This library will remain on version 0.0.x until all features required are in stable Rust, standardized in WASM, and baseline widely available across browsers.
//!
//! To get started using this library, please refer to the [book](https://wbgspawn.pistonite.dev).
//! The [Playground](https://wbgspawn-playground.pistonite.dev) also has runnable examples.

#[cfg(all(target_arch = "wasm32", not(target_feature = "atomics"), not(doc)))]
compile_error!(
    "-Ctarget_feature=atomics is not enabled. Please read the README and set the right rustflags"
);

mod spawn;
pub use spawn::{
    SpawnError, ThreadDispatcherInit, init_bg_no_modules, init_bg_web, spawn, spawn_async,
    terminate_dispatcher, try_spawn, try_spawn_async,
};
mod join;
pub use join::{AsyncJoinHandle, JoinHandle};
/// The worker thread's runtime, which contains wrappers for handling panics
mod runtime;
pub use runtime::spawn_local;

/// Interop with JS
mod binding;
#[allow(unused)]
mod binding_constants;

mod util;
