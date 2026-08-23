use std::thread;
use std::time::Duration;

use js_sys::{Function, Promise};
use wasm_bindgen::prelude::*;

use crate::harness;

/// Spawn a thread and spawn a promise from the thread that
/// causes a Rust panic should terminate that thread
#[wasm_bindgen]
pub fn example_async_panic() {
    let l = line!();
    harness::log("test-src", &format!("example_async_panic={}:{l}", file!()));
    harness::log("test-start", "example_async_panic");
    let log_context = "test-log:example_async_panic";
    // -------- in the example you may ignore the harness calls; they are for tests only

    let thread1 = wasm_bindgen_spawn::spawn_async(|| async {
        let sleep = Function::new_no_args("return new Promise(r=>setTimeout(r,1000))");
        let sleep2 = sleep.clone();
        wasm_bindgen_spawn::spawn_local(async move {
            let _ = sleep
                .call0(&JsValue::undefined())
                .unwrap()
                .dyn_into::<Promise>()
                .unwrap()
                .await;
            panic!("test async panic from thread1!");
        });
        // ensure this context outlives the other task that will panic
        for _ in 0..3 {
            let _ = sleep2
                .call0(&JsValue::undefined())
                .unwrap()
                .dyn_into::<Promise>()
                .unwrap()
                .await;
        }
    });

    // thread2 is exactly the same except we use js_sys::futures::spawn_local
    // instead of wasm_bindgen_spawn::spawn_local
    //
    // the panic is propagated directly to JS as an unhandled rejection,
    // currently, the handling is up to the runtime. Typically native runtimes
    // (using node:worker_threads or Worker in Deno) terminates the worker,
    // causing the thread to hang if you attempt to join it. Browsers on the other hand,
    // ignores the unhandled rejection, making the Rust code safe to continue if panic=unwind.
    // (Note that it will still continue when panic=abort, which is not safe and might
    // cause disaster or weird bugs)
    //
    // ** This is why you need to use wasm_bindgen_spawn::spawn_local !!! **
    let thread2 = wasm_bindgen_spawn::spawn_async(|| async {
        let sleep = Function::new_no_args("return new Promise(r=>setTimeout(r,1000))");
        let sleep2 = sleep.clone();
        js_sys::futures::spawn_local(async move {
            let _ = sleep
                .call0(&JsValue::undefined())
                .unwrap()
                .dyn_into::<Promise>()
                .unwrap()
                .await;
            panic!("test async panic from thread2!");
        });
        // ensure this context outlives the other task that will panic
        for _ in 0..3 {
            let _ = sleep2
                .call0(&JsValue::undefined())
                .unwrap()
                .dyn_into::<Promise>()
                .unwrap()
                .await;
        }
    });

    // thread1 will receive the panic info
    match thread1.join() {
        Ok(()) => harness::log(log_context, "{\"thread1\":\"ok\"}"),
        Err(e) => {
            let msg = harness::panic_info(&e);
            harness::log(
                log_context,
                &format!("{{\"thread1\":\"err\",\"msg\":{msg:?}}}"),
            )
        }
    }

    // sleep some time to ensure if thread2 is going to finish, it should be
    thread::sleep(Duration::from_secs(3));
    let finished = thread2.is_finished();
    harness::log(
        log_context,
        &format!("{{\"thread2\":\"finished\",\"finished\":{finished}}}"),
    );
    if finished {
        // the Ok(()) branch will match in the cases where the runtime ignores the unhandled
        // rejection
        match thread2.join() {
            Ok(()) => harness::log(log_context, "{\"thread2\":\"ok\"}"),
            Err(e) => {
                let msg = harness::panic_info(&e);
                harness::log(
                    log_context,
                    &format!("{{\"thread2\":\"err\",\"msg\":{msg:?}}}"),
                )
            }
        }
    }

    // -------- in the example you may ignore the harness calls; they are for tests only
    harness::log("test-end", "example_async_panic");
}
