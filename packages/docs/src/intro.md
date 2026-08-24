# wasm-bindgen-spawn

<img src="https://img.shields.io/crates/v/wasm-bindgen-spawn" alt="version badge"/>
<img src="https://img.shields.io/github/license/Pistonite/wasm-bindgen-spawn" alt="license badge"/>
<img src="https://img.shields.io/github/issues/Pistonite/wasm-bindgen-spawn" alt="issues badge"/>

`wasm-bindgen-spawn` is a Web Worker based multithreading library for Rust and WebAssembly.

This uses the WebAssembly [threads proposal](https://github.com/WebAssembly/threads/blob/master/proposals/threads/Overview.md)
and shared memory to communicate between workers (once they are started), instead of `postMessage`.
The threads proposal is currently in [phase 4](https://webassembly.org/features/) and available in all major browsers and runtimes.

> [!NOTE]
> This library will remain on version `0.0.x` until all features required are in stable Rust,
> standardized in WASM, and baseline widely available across browsers.

> [!CAUTION]
> Rust and `wasm-bindgen` frequently change
> the `RUSTFLAGS` needed to compile with threading support enabled. If you
> cannot build with configs given in this guide, please
> open an issue on GitHub.

> [!CAUTION]
> Ensure you are using a [supported version](./support.md) of the tools and engines.
> We are working at the very cutting edge. Most tools require the latest version
> or even building from source for unreleased bug fixes.

## Getting Started
- See [Support Matrix](./support.md) for the toolchains, JS engine, and `wasm-pack` target support.
- See [Setup Guide](./setup.md) for how to setup your project to use this library.
- See [Playground](https://wbgspawn-playground.pistonite.dev) for runnable examples
  that also link to the example source code on GitHub.
- The remaining chapters of the book cover basic usage of the library.
  for advanced technical reference, see the [API documention on docs.rs](https://docs.rs/wasm-bindgen-spawn)

## Special thanks
- [`wasm-mt`](https://github.com/w3reality/wasm-mt) project for the links they put in the README
  which sparked my interest to do a deep dive and ultimately create this project.
- [`wasm-bindgen-rayon`](https://github.com/RReverser/wasm-bindgen-rayon/blob/main/README.md) project, which helped me understanding the prerequisites like [Cross-Origin Isolation](./setup.md#cross-origin-isolation)
- [Ciantic's experimental work](https://github.com/Ciantic/rust-shared-wasm-experiments) - very helpful in getting a basic example up and running
