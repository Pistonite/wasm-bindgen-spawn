# wasm-bindgen-spawn
A Web Worker based multithreading library for Rust and WebAssembly.

This uses the WebAssembly [threads proposal](https://github.com/WebAssembly/threads/blob/master/proposals/threads/Overview.md), which is currently in [phase 4](https://webassembly.org/features/) and available in Chrome, Firefox, Safari and Node.js
and shared memory to communicate between workers (once they are started), instead of `postMessage`.

At the current stage, this is the closest thing to `std::thread::spawn`
that "Just Works" for `wasm32-unknown-unknown` target. You can:
- Spawn a thread with a Rust closure
- Join a thread
- Send data between threads using channels
- Synchronize threads using `std::sync` primitives

Nightly Rust toolchain is required for unstable features. This library
will remain on version `0.0.x` until all features required are in stable Rust,
standardized in WASM, and baseline widely available across browsers.

## Examples
The [`examples`](./examples) directory contains a full Vite example. You
can see the demo [here](https://pistonite.github.io/wasm-bindgen-spawn).

See [ThreadCreator](https://docs.rs/wasm-bindgen-spawn/latest/wasm_bindgen_spawn/struct.ThreadCreator.html) for the main API.

## Background/Design
I wrote a blog on how and why this library is designed this way,
and what the limitations are. You can read it [here](https://pistonite.github.io/wasm-bindgen-spawn/blog).

## Requirements

### Cross-Origin Isolation

You can read more about this in the [web dev article](https://web.dev/articles/coop-coep). Long story short:
- This is required for `SharedArrayBuffer`
- This is to mitigate Spectre-like attacks

To get started, the server that serves the main document must send these headers:
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

You can check if the document is in a cross-origin isolated context by running this in the console:
```js
self.crossOriginIsolated
```

Read the full article for more details on the implications of Cross-Origin Isolation.

### Rust Nightly and `target-feature`
1. Create a `rust-toolchain` file (no extensions) and put `nightly` in it, to use the nightly toolchain
    ```sh
    echo "nightly" > rust-toolchain
    ```
2. Add the following to `.cargo/config.toml`
```toml
[target.wasm32-unknown-unknown]
rustflags = ["-C", "target-feature=+atomics,+bulk-memory,+mutable-globals"]

[unstable]
build-std = ["panic_abort", "std"]
```

### `wasm-pack` Target
Currently, this library only supports the `no-modules` target:
```sh
wasm-pack build -t no-modules
```

### WASM in Web Worker
Since the main thread in web cannot block, you must use blocking operations in a 
web worker, this include:
1. Calling `join` on a JoinHandle
2. Calling `recv` on a Receiver in the `std::sync` library or `oneshot` library.

The [example](https://github.com/Pistonite/wasm-bindgen-spawn/tree/main/example) shows how to put the WASM module in the worker. You can
then use some kind of RPC with `postMessage` to communicate between the main thread and the worker.
This is probably something you have to do anyway to avoid the heavy, multithreaded computation freezing the UI.
