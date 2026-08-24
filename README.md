# wasm-bindgen-spawn

![Version Badge](https://img.shields.io/crates/v/wasm-bindgen-spawn)
![License Badge](https://img.shields.io/github/license/Pistonite/wasm-bindgen-spawn)
![Issue Badge](https://img.shields.io/github/issues/Pistonite/wasm-bindgen-spawn)

A Web Worker based multithreading library for Rust and WebAssembly.

This uses the WebAssembly [threads proposal](https://github.com/WebAssembly/threads/blob/master/proposals/threads/Overview.md)
and shared memory to communicate between workers (once they are started), instead of `postMessage`.
The threads proposal is currently in [phase 4](https://webassembly.org/features/) and available in all major browsers and runtimes.

At the current stage, this is the closest thing to `std::thread::spawn`
that "Just Works" for `wasm32-unknown-unknown` target. For example you can:
- Spawn a thread with a Rust closure
- Join a thread
- Send data between threads using channels
- Synchronize threads using `std::sync` primitives

Nightly Rust toolchain is required for unstable features. This library
will remain on version `0.0.x` until all features required are in stable Rust,
standardized in WASM, and baseline widely available across browsers.

## Examples
The [Playground](https://wbgspawn-playground.pistonite.dev) has runnable examples and links to their source code on GitHub.

## Documentation
- For setup, tutorial, and concepts, please refer to [the book](https://wbgspawn.pistonite.dev).
- For technical reference, refer to [API documentation on docs.rs](https://docs.rs/wasm-bindgen-spawn).
- There is also a [blog post](https://wbgspawn.psitonite.dev/design.html) I wrote when I first made this library
