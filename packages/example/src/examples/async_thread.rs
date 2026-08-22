use js_sys::{Function, JsString, Promise};
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

    // in thread1 we try to use the fetch API
    let thread1 = wasm_bindgen_spawn::spawn_async(|| async {
        // note we have to create this function inside the thread
        // since JS values are tied to the worker context and thus
        // not Send/Sync at all
        let fetch_text = Function::new_with_args(
            "ARG",
            r"
            return (async function(x){
                const response = await fetch(x);
                return await response.text();
            })(ARG)",
        );

        let url = "https://raw.githubusercontent.com/Pistonite/wasm-bindgen-spawn/refs/heads/main/LICENSE";
        let request = match fetch_text.call1(&JsValue::undefined(), &url.into()) {
            Ok(x) => x,
            Err(e) => {
                harness::error(e);
                anyhow::bail!("fetch failed");
            }
        };
        let content_promise = match request.dyn_into::<Promise>() {
            Ok(x) => x,
            Err(e) => {
                harness::error(e);
                anyhow::bail!("fetch function didn't return a promise")
            }
        };
        let content = match content_promise.await {
            Ok(x) => x,
            Err(e) => {
                harness::error(e);
                anyhow::bail!("failed to await for request promise");
            }
        };
        let content_str = match content.dyn_into::<JsString>() {
            Ok(x) => String::from(x),
            Err(e) => {
                harness::error(e);
                anyhow::bail!("fetch promise didn't resolve to a string");
            }
        };
        anyhow::Ok(content_str)
    });

    // thread2 we just sleep for 1 second, even though there's no real work,
    // this shows the control must be passed back to the JS runtime
    let thread2 = wasm_bindgen_spawn::spawn_async(|| async {
        harness::log(log_context, "{\"thread2\":\"start\"}");
        let sleep = Function::new_no_args("return new Promise(r=>setTimeout(r,1000))");
        let _ = sleep
            .call0(&JsValue::undefined())
            .unwrap()
            .dyn_into::<Promise>()
            .unwrap()
            .await;
        harness::log(log_context, "{\"thread2\":\"done\"}");
    });

    match thread1.join() {
        Err(e) => {
            let msg = harness::panic_info(&e);
            harness::log(
                log_context,
                &format!("{{\"thread1\":\"panic\",\"error\":{msg:?}}}"),
            );
        }
        Ok(Err(e)) => {
            let msg = e.to_string();
            harness::log(
                log_context,
                &format!("{{\"thread1\":\"ok_err\",\"error\":{msg:?}}}"),
            );
        }
        Ok(Ok(x)) => {
            let is_mit_license = x.starts_with("MIT License");
            let bytes = x.len();
            harness::log(
                log_context,
                &format!(
                    "{{\"thread1\":\"ok_ok\",\"is_mit_license\":{is_mit_license},\"bytes\":{bytes}}}"
                ),
            );
        }
    }

    thread2.join().unwrap();

    // -------- in the example you may ignore the harness calls; they are for tests only
    harness::log("test-end", "example_async_thread");
}
