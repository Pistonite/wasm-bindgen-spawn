
use js_sys::{Function, Promise};
use wasm_bindgen::prelude::*;

use crate::harness;

/// Spawn a thread that has an async main function,
/// which allows it to run co-operatively with other things in the JS
/// event loop
#[wasm_bindgen]
pub fn example_async_thread() {
    harness::log("test-start", "example_async_thread");
    let log_context = "test-log:example_async_thread";
    // -------- in the example you may ignore the harness calls; they are for tests only

    // let thread = wasm_bindgen_spawn::spawn_future(async {
    //     // note we have to create this function inside the thread
    //     // since JS values are tied to the worker context and thus
    //     // not Send/Sync at all
    //     let fetch_text = Function::new_with_args("ARG", r"
    //         return (async function(x){
    //             const response = await fetch(x);
    //             return await response.text();
    //         })(ARG)");
    //
    //     let url = "https://raw.githubusercontent.com/Pistonite/wasm-bindgen-spawn/refs/heads/main/LICENSE";
    //     let request = match fetch_text.call1(&JsValue::undefined(), &url.into()) {
    //         Ok(x) => x,
    //         Err(e) => {
    //             // harness::error(e);
    //             anyhow::bail!("fetch failed");
    //         }
    //     };
    //     let content_promise = match request.dyn_into::<Promise>() {
    //         Ok(x) => x,
    //         Err(e) => anyhow::bail!("fetch function didn't return a promise"),
    //     };
    //     let content = match content_promise.await {
    //         Ok(x) => x,
    //         Err(e) => anyhow::bail!("failed to await for request promise"),
    //     };
    //
    //     anyhow::Ok(())
    // });

    // -------- in the example you may ignore the harness calls; they are for tests only
    harness::log("test-end", "example_async_thread");
}
async fn some_fn_non_send(fetch: js_sys::Function, url: &str) {
    use wasm_bindgen::JsCast;

    let request = match fetch.call1(&wasm_bindgen::JsValue::undefined(), &url.into()) {
        Ok(x) => x,
        Err(e) => {
            // harness::error(e);
            return
        }
    };
    let content_promise = match request.dyn_into::<js_sys::Promise>() {
        Ok(x) => x,
        Err(e) => return,
    };
    let content = match content_promise.await {
        Ok(x) => x,
        Err(e) => return
    };
}
fn test_fn() {
    let url = "aaa";
    let f: Box<dyn FnOnce() + Send> = Box::new( || {
        let fetch_text = js_sys::Function::new_with_args("ARG", r"
            return (async function(x){
                const response = await fetch(x);
                return await response.text();
            })(ARG)");
        async { some_fn_non_send(fetch_text, url).await };
      
    });
    // let f2: Box<dyn Future<Output=()> + Send> = Box::new(async move {
    // let fetch_text = js_sys::Function::new_with_args("ARG", r"
    //         return (async function(x){
    //             const response = await fetch(x);
    //             return await response.text();
    //         })(ARG)");
    //     some_fn_non_send(fetch_text, "aaa").await
    // });
}
