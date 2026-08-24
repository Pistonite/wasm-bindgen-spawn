# Setup Guide

> [!IMPORTANT]
> Ensure you are using a supported version of the tools and engines.
>
> See [Support Matrix](./support.md)

## Adding to Cargo dependency
Please add `wasm-bindgen-spawn` as a Cargo dependency to your Rust WASM project.
```
cargo add wasm-bindgen-spawn
```

## Cross-Origin Isolation
You can read more about cross-origin isolation in [this web.dev article](https://web.dev/articles/coop-coep). TL;DR is:
- This is required for `SharedArrayBuffer`
- This is to mitigate Spectre-like attacks

All frame and worker responses from the web server that serves your project
must send these headers to enable cross-origin isolation:
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

You can check that cross-origin isolation is enabled by running:
```javascript
console.log(globalThis.crossOriginIsolated); // true
```

> [!NOTE]
> This is not necessary for native engines such as NodeJS.

## Caveat about blocking operations
Browsers [do not allow the main thread to be blocked by Atomics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics#:~:text=(Most%20browsers%20will%20not%20allow%20wait()%20on%20the%20browser%27s%20main%20thread.)).
Therefore, any blocking operations such as calling `.join()` on a thread's join handle,
or `.lock()` on a `Mutex`, must be done in a Web Worker.

Native engines typically do not have this restriction, although blocking
the JS event loop may cause certain IO operations to pause,
such as `console.log`.

## Rust and Cargo setup
> [!CAUTION]
> WASM Threading is not standardized. Rust and `wasm-bindgen` frequently change
> the `RUSTFLAGS` needed to compile with threading support enabled. If you
> cannot build with the example `.cargo/config.toml` in this guide, please
> open an issue on GitHub.

Nightly Rust is needed to use the unstable features we depend on.

There are 2 options:
1. Add a `rust-toolchain` file to your crate or parent directories that indicates
   the version of the toolchain to use. For example:
   ```
   nightly
   ```
   Or specify an exact version
   ```
   nightly-2026-08-23
   ```
2. Specify the toolchain on every cargo invocation with
   ```
   cargo +nightly
   ```

For cargo project setup, there are 2 places that need changes.
First, add a `.cargo/config.toml` file in the root of your crate

> [!NOTE]
> Enabling `panic=unwind` is recommended for a better experience working with panics
> in threads. However, there are some caveats. Please refer to
> the [Panic Guide](./panic.md)
>
> The config below enables `panic=unwind` with comments for how to change to
> `panic=abort`

```toml
# This serves as the source of truth of what the .cargo/config.toml
# should look like

[target.wasm32-unknown-unknown]
rustflags = [
    "-Ctarget-feature=+atomics",

    "-Clink-args=--shared-memory",
    "-Clink-args=--import-memory",
    "-Clink-args=--max-memory=1073741824",
    "-Clink-args=--export=__wasm_init_tls",
    "-Clink-args=--export=__tls_size",
    "-Clink-args=--export=__tls_align",
    "-Clink-args=--export=__tls_base",
    "-Clink-args=--export=__heap_base",

    "-Cpanic=unwind" # -- remove if you use panic=abort, which is the default
    # note: DO NOT pass --panic-unwind to wasm-pack because it will override
    # other RUSTFLAGS needed for threading support

]

# RUSTFLAGS changelog:
#
# 2021-07-22 - Ciantic: Tested +simd128 22.7.2021, didn't work! Got some wasm-opt problems.
# 2024-10-01 - It now works, but threading works without it. So probably best to wait for it to stabilize.
# 2025-06-12 - mutable-globals is enabled by default, and bulk-memory is enabled by default on Rust 1.87+
# 2025-10-02 - rust now requires extra -Clink-args to enable shared-memory, see https://github.com/rust-lang/rust/pull/147225
# 2026-08-11 - Since WBG 0.2.122 / Rust nightly 2026-05-06, __heap_base needs to be explicitly exported.

[unstable]
build-std = ["panic_unwind", "std"] # -- change "panic_unwind" to "panic_abort" if you use panic=abort

[profile.release]
panic = "unwind" # -- remove this if you use panic=abort
```

Also add the following metadata for `wasm-pack` in `Cargo.toml`

```toml
[package]
# ... your package info

[dependencies]
# ... your dependencies info

[lib]
crate-type = ["cdylib", "rlib"] # -- this is required for wasm-bindgen/wasm-pack

# add these to use panic=unwind, remove if you wish to use panic=abort
[package.metadata.wasm-pack.profile.dev]
wasm-opt = ['--enable-exception-handling']
[package.metadata.wasm-pack.profile.release]
wasm-opt = ['--enable-exception-handling', '-O']
[package.metadata.wasm-pack.profile.profiling]
wasm-opt = ['--enable-exception-handling', '-O']
```


## Wasm-pack Target
Additional setup might be needed depending on the target (the `-t/--target` flag)
your project uses for `wasm-pack build`, which defaults to `bundler`.
See [Support Matrix](./support.md#wasm-pack-target-support) for the Target x JS Engine
support status.

> [!NOTE]
> The examples export async Rust functions that can be `await`-ed in JS.
> This feature requires additional dependencies. See [API Usage](./basic_example.md)
> for details as well as a version of the API that does not require additional dependencies.

### `no-modules` and `web`
If you use the `no-modules` or `web` target, no additional setup is needed on the
`wasm-pack` side. Use `wasm_bindgen_spawn::init_bg_no_modules` or `wasm_bindgen_spawn::init_bg_web`
accordingly:

```javascript
// JS side:
// need to fetch the bindgen script from your web service.
// (package_name would be whatever the crate name is or the `--out-name` parameter passed
// to wasm-pack)
const bindgenScriptLocation = location.origin + "/path/to/package_name.js";
const bindgenScript = await (await fetch(bindgenScriptLocation)).text();

// now initialize the wasm package
// here, assuming our target is web, we can import the same path as an ESM.
// for no-modules, it will require extra build config, such as inlining the bindgen
// script into your code.
const wasm_bindgen = await import(bindgenScriptLocation);
// here we use the default-initialization which replaces the `.js` with `_bg.wasm`
// in the script path.
// if your wasm location is different you need to pass in { module_or_path: .. }
// to the init function
await wasm_bindgen.default();

// now we can initialize wasm-bindgen-spawn (see below)
await wasm_bindgen.init_thread_dispatcher(bindgenScript);
```

```rust
// Rust side:
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub async fn init_thread_dispatcher(bg_script: JsValue) {
    // call init_bg_no_modules if the script format is no-modules
    wasm_bindgen_spawn::init_bg_web(bg_script, wasm_bindgen::module())
        .create_dispatcher().await;
    // once the future/promise returned by create_dispatcher/create_dispatcher_promise
    // is resolved, you can start spawning threads.
}
```

### `nodejs`
> [!WARNING]
> 
> The `nodejs` target emits CommonJS which is not recommended in modern projects.
> You may have to change the file extension of the bindgen script to `.cjs`.

First, you need to generate a copy of the bindgen script for either the `no-modules`
or the `web` target. Here we use `no-modules` as an example.

```sh
# 1. run your normal build command
wasm-pack build -t nodejs ...
# 2. also build no-modules
wasm-pack build -t no-modules --out-dir some-temp-output ...
# 3. copy the bindgen script, the rest are not important
cp some-temp-output/my_package.js normal-output/my_package_no_modules.js
# 4. for this example you need to change the output extension to .cjs,
#    your mileage may vary
mv normal-output/my_package.js normal-output/my_package.cjs
```

```javascript
// JS Side, native engine (NodeJS or Bun)
import "fs" from "node:fs";

// the nodejs target script will auto-init the wasm module 
const wasm_bindgen = await import("normal-output/my_package.cjs");
// we also need to read the no_modules script
const bindgenScript = fs.readFileSync("normal-output/my_package_no_modules.js", "utf8");
// now we can initialize wasm-bindgen-spawn
await wasm_bindgen.init_thread_dispatcher(bindgenScript);
```

See the `no-modules`/`web` section for the Rust side.

### `deno`
The `deno` target requires:
1. A copy of the bindgen script for either the `no-modules` or `web` target,
   like the `nodejs` target.
2. The WASM module bytes

Here we use `no-modules` as an example. See the `nodejs` section for the `wasm-pack` commands.

```javascript
// JS Side, native engine (Deno or Bun)
import "fs" from "node:fs";
// the deno target script will auto-init the wasm module 
const wasm_bindgen = await import("normal-output/my_package.js");
// we also need to read the no_modules script
const bindgenScript = fs.readFileSync("normal-output/my_package_no_modules.js", "utf8");
// we also need to read a copy of the wasm
const wasmBytes = fs.readFileSync("normal-output/my_package_bg.wasm");
// now we can initialize wasm-bindgen-spawn
await wasm_bindgen.init_thread_dispatcher_with_wasm(bindgenScript, wasmBytes);
```

```rust
// Rust side
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub async fn init_thread_dispatcher_with_wasm(bg_script: JsValue, wasm_bytes: JsValue) {
    // call init_bg_web if the script format is web
    wasm_bindgen_spawn::init_bg_no_modules(bg_script, wasm_bytes)
        .create_dispatcher().await;
    // once the future/promise returned by create_dispatcher/create_dispatcher_promise
    // is resolved, you can start spawning threads.
}
```

### `bundler`
The `bundler` target requires:
1. A copy of the bindgen script for either the `no-modules` or `web` target,
   like the `nodejs` and `deno` targets.
2. The WASM module bytes, like the `deno` target.
3. A bundler to bundle the code generated by wasm-pack.

See the `nodejs` section above for how to generate the additional bindgen script.

Using `vite` and `vite-plugin-wasm` as an example, a minimal config may look like
```javascript
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

export default defineConfig({
    plugins: [wasm(), /* ... other plugins */],
    /* ... other configs */
});
```

Again using `vite` as an example, we may import the raw script using the `?raw` parameter.

```javascript
// the bundler must initialize the wasm instance
import wasm_bindgen from "my-wasm-pack-output";
import bindgenScript from "my-wasm-pack-output/my_package_no_modules.js?raw";
// currently there's no built-in way to import as binary, so we use the url method
// or you may use another plugin to load an asset as bytes
const wasmResponse = await fetch(new Url("my-wasm-pack-output/my_package_bg.wasm", import.meta.url));
const wasmBytes = await wasmResponse.arrayBuffer();

// now we can initialize wasm-bindgen-spawn
await wasm_bindgen.init_thread_dispatcher_with_wasm(bindgenScript, wasmBytes);
```

See the `deno` section above for the Rust side.
