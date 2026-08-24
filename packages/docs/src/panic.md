# Working with Panic

> [!IMPORTANT]
> 
> This chapter covers caveats when a thread spawned with this library panics.
> It is not a tutorial about panicking in Rust, nor a tutorial about unwinding
> or `UnwindSafe`-ty.
>
> This is also not a tutorial about how panics work in WASM or `wasm-bindgen`.
> Please refer to [Catching Panics](https://wasm-bindgen.github.io/wasm-bindgen/reference/catch-unwind.html)
> and [Handling Aborts](https://wasm-bindgen.github.io/wasm-bindgen/reference/handling-aborts.html)
> in the `wasm-bindgen` guide.

In Rust, panic is a feature to trigger alternate control flow similar to exceptions in other languages.

## Abort vs. Unwind
Historically when `panic=unwind` was not supported, panics triggers `unreachable` instruction
in WASM, which causes a dreaded `Runtime Error: unreachable` in JS:

```javascript
// JS
try {
    call_rust()
} catch(e) {
    console.error(e);
}
```
```rust
// Rust
fn call_rust() {
    std::panic::catch_unwind(|| {
        panic!("wooo");
    });
}
```
Output:
```
Runtime Error: unreachable
<some unreadable stack trace>
```

Historically, the debugability issue is solved by using a panic hook to print the panic information
before `unreachable` is triggered. However, it does not fix the fact that a panic hard-aborts the WASM instance, meaning:
- Variables are not dropped. Memory will leak.
- Mutexes are not poisoned. If a thread panics while holding a mutex, the mutex will never be released.
- `catch_unwind` has no effect.
- The WASM instance is generally left in a state that's not safe to call. If you call it anyway,
  it might be fine, or it might fail with disaster.

With `panic=unwind` however, things "just work":
- Variables are dropped during unwind, cleaning up memory.
- Mutexes are also dropped during unwind, causing them to poison rather than lock forever.
- `catch_unwind` may be used to pause the unwind and inspect the payload, optionally recover.
- The WASM instance is not aborted
- In `wasm-bindgen`, unwinds across the JS-Rust boundary manifests as `PanicError`.

Note that however, hard-aborts can still happen even when `panic=unwind`, meaning this library
needs to handle `abort`s if `panic=unwind` and *both* `abort`s and `unwind`s if `panic=unwind`.


## Panic from a synchronous thread
When a synchronous thread panics, the join handle will reliably detect the panic, even in the case
of `panic=abort`.

```rust
let thread = wasm_bindgen_spawn::spawn(move || {
    panic!("test!");
}
assert!(thread.join().is_err());
```

The difference is the panic payload:
- If `panic=unwind`, the original panic payload is delivered to the join handle, meaning
  you can inspect the error message, etc.
- If `panic=abort`, or the WASM instance hard-aborted in `panic=unwind`, the panic information is lost. The join handle gets a generic error
  `thread panicked or aborted`

You can observe the difference in behavior in the `example_join_handle` and `example_mutex_poison`
examples in the [Playground](https://wbgspawn-playground.pistonite.dev)

## Async panics
> [!NOTE]
> Please refer to [Working woth Async code](./async.md) for the `spawn_async` API

When an asynchronous thread panics, it is trickier to deal with. To see why, let's consider
the following example:


```rust
#[wasm_bindgen]
extern "C" {
    fn do_something_async() -> Promise;
}
wasm_bindgen_spawn::spawn_async(|| async {
    let _ = do_something_async().await.unwrap();
    panic!("test panic!");
});
```

This panic now cannot be simply handled by wrapping the thread with `std::panic::catch_unwind`.
Let's trace the process to see how the async panic works:
- The JS Event loop calls the thread's main function
- The main function returns a future (read [here](./async.md#send-bounds) for why)
- The future is spawned by `js_sys::futures` onto the JS Event loop
- The JS Event loop asynchronously wakes the future, entering Rust code
