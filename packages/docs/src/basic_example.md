# API Usage

> [!IMPORTANT]
> Ensure you are using a supported version of the tools and engines
> as specified in the [Support Matrix](./support.md), and have read through
> the required [Setup Guide](./setup.md)
>
> This tutorial covers basic usage. For detailed technical reference please
> refer to the [API Doc](https://docs.rs/wasm-bindgen-spawn) on docs.rs

## Creating the thread dispatcher
The thread dispatcher is its own "thread" that allows new threads to be spawned
without the need to rely on the JS event loop. You may read more about this design
in the [Design Blog](./design.md)

The thread dispatcher is initialized in 2 phases:
1. Call one of the `init_bg_*` functions to create an instance of 
   [`ThreadDispatcherInit`](https://docs.rs/wasm-bindgen-spawn/latest/wasm_bindgen_spawn/struct.ThreadDispatcherInit.html).
2. Use the JS Event Loop to wait for the thread dispatcher to be ready.
   The `spawn()` API only works after the thread dispatcher is `await`-ed to be ready;
   this prevents dead locks from trying to join a thread before the dispatcher is ready.

```rust
// if you use wasm-pack build -t no-modules ...
let init = wasm_bindgen_spawn::init_bg_no_modules(bg_script, wasm_bindgen::module());
// if you use wasm-pack build -t web ...
let init = wasm_bindgen_spawn::init_bg_web(bg_script, wasm_bindgen::module());
```

> [!NOTE]
> Currently the `init_bg_*` function accepts the bindgen script
> from either the `no-modules` or the `web` target in `wasm-pack`.
> If your project uses another target, refer to [Wasm-pack Target Setup](./setup.md#wasm-pack-target)
> to set up the required scripts.
> 
> The `wasm_bindgen::module()` API is available in targets other than `bundler` and `deno`.
> Refer to the same setup guide for how to pass in the value from the JS side in these targets.

Next, create the dispatcher and wait for it to be ready.


```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub async fn init_thread_dispatcher(bg_script: JsValue) {
    wasm_bindgen_spawn::init_bg_no_modules(bg_script, wasm_bindgen::module())
        .create_dispatcher().await.unwrap();
}
```
Then call and await this function in JS (see [Wasm-pack Target Setup](./setup.md#wasm-pack-target) for full setup)
```javascript
await wasm_bindgen.init_thread_dispatcher(bindgenScript)
```

Now the thread dispatcher is ready and you can spawn some threads!

> [!TIP]
> You can use the async init function if you use `wasm-bindgen-futures`, or `js_sys::futures` (enabled with either the
> `WASM_BINDGEN_USE_JS_SYS=1` environment variable or the `--cfg=wasm_bindgen_use_js_sys` cfg flag).
> 
> If you don't want to add additional dependencies other than `wasm-bindgen`,
> you can use the [`create_dispatcher_promise()`](https://docs.rs/wasm-bindgen-spawn/latest/wasm_bindgen_spawn/struct.ThreadDispatcherInit.html#method.create_dispatcher_promise)
> API instead, which uses `js_sys::futures` internally to drive the dispatcher future with the JS event loop.
> ```rust
> use wasm_bindgen::prelude::*;
> 
> #[wasm_bindgen]
> pub fn init_thread_dispatcher(bg_script: JsValue) -> JsValue /* Promise */{
> //  ^^ note this function is not async in rust
>     wasm_bindgen_spawn::init_bg_no_modules(bg_script, wasm_bindgen::module())
>         .create_dispatcher_promise().into()
> }
> ```
> The JS side is identical
> ```javascript
> await wasm_bindgen.init_thread_dispatcher(bindgenScript)
> ```


## Spawn and join
Spawn a thread with [`wasm_bindgen_spawn::spawn()`](https://docs.rs/wasm-bindgen-spawn/latest/wasm_bindgen_spawn/fn.spawn.html),
which has an identical signature to `std::thread::spawn`:

```rust
let thread = wasm_bindgen_spawn::spawn(move || {
    /* here the code is now running inside a different worker JS context */
    1
});
let output = thread.join().unwrap();
assert_eq!(output, 1);
```

## Terminating the thread dispatcher
On native engines such as NodeJS, Deno and Bun, a worker that stays alive
will keep the whole program running. Since the thread dispatcher
is itself a worker, you may need to manually terminate it by calling
[`terminate_dispatcher()`](https://docs.rs/wasm-bindgen-spawn/latest/wasm_bindgen_spawn/fn.terminate_dispatcher.html)
during program shutdown.

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn uninit() {
    wasm_bindgen_spawn::terminate_dispatcher();
}
```
```javascript
// JS side, after you are done with all the threads
wasm_bindgen.uninit();
```

## Handle async code
You can use [`wasm_bindgen_spawn::spawn_async`](https://docs.rs/wasm-bindgen-spawn/latest/wasm_bindgen_spawn/fn.spawn_async.html)
to spawn a future as the "main function" of the thread. The future is driven co-operatively with the JS event loop.

```rust
let thread = wasm_bindgen_spawn::spawn_async(move || async move {
    // even though setTimeout does nothing, it is a minimal example
    // that truly requires yielding to the JS event loop
    let sleep = Function::new_no_args("return new Promise(r=>setTimeout(r,1000))");
    let _ = sleep
        .call0(&JsValue::undefined())
        .unwrap()
        .dyn_into::<Promise>()
        .unwrap()
    .await;
    1
});
let output = thread.join().unwrap();
assert_eq!(output, 1);
```

> [!IMPORTANT]
> 
> Before starting to use async threads, be sure to read about the caveats,
> including why `spawn_async` takes `move || async move {...}`, in
> the [Working with Async code](./async.md) chapter.

## Non-blocking join
Similar to the [`JoinHandle`](https://doc.rust-lang.org/std/thread/struct.JoinHandle.html) in the Rust standard library,
the [`wasm_bindgen_spawn::JoinHandle`](https://docs.rs/wasm-bindgen-spawn/latest/wasm_bindgen_spawn/struct.JoinHandle.html)
provides ways to perform a non-blocking join of the thread.

```rust
let thread = wasm_bindgen_spawn::spawn(move || {
    /* ... */
});
// use is_finished() to check if join will block
if thread.is_finished() {
    // join will not block
    let output = thread.join().unwrap();
}
```

The `JoinHandle` also implements `IntoFuture` for an asynchronous join.

```rust
let thread = wasm_bindgen_spawn::spawn(move || {
    /* ... */
});
// asynchronously join the thread: the async runtime may do other things
// while the thread is still running
let output = thread.await.unwrap();
```

## Handle panic
The `JoinHandle` API captures panics in the thread and returns them as an `Err`
containing the opaque panic payload. The signature is identical to the standard library.

```rust
let thread = wasm_bindgen_spawn::spawn(move || {
    /* ... */
});
match thread.join() {
    Ok(x) => /* ... */,
    Err(e /* Box<dyn Any + Send + 'static> */) => {
        /* ... */
    }
}
```

> [!CAUTION]
> Panics are extremely tricky to handle, especially when different engines may
> exhibit different behaviors related to aborts and JS unhandled rejections,
> as well as panics in *detached futures*.
>
> This library tries to make it really hard for panics to turn into uncontrollable
> failures if you do the right things. See the [Working with Panic](./panic.md) chapter
> for more information
