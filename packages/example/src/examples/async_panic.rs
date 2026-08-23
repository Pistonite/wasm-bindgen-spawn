use std::thread;
use std::time::Duration;

use js_sys::{Function, JsString, Promise};
use wasm_bindgen::prelude::*;

use crate::harness;

/// Spawn a thread and spawn a promise from the thread that
/// causes a Rust panic should terminate that thread
#[wasm_bindgen]
pub fn example_async_panic() {
    harness::log("test-start", "example_async_panic");
    let log_context = "test-log:example_async_panic";
    // -------- in the example you may ignore the harness calls; they are for tests only
    
    // let thread1 = wasm_bindgen_spawn::spawn_async(|| async {
    //     let sleep = Function::new_no_args("return new Promise(r=>setTimeout(r,1000))");
    //     let sleep2 = sleep.clone();
    //     wasm_bindgen_spawn::spawn_local(async move {
    //         let _ = sleep
    //             .call0(&JsValue::undefined())
    //             .unwrap()
    //             .dyn_into::<Promise>()
    //             .unwrap()
    //         .await;
    //         panic!("test async panic from thread1!");
    //     });
    //     // ensure this context outlives the other task that will panic 
    //     for _ in 0..3 {
    //         let _ = sleep2
    //             .call0(&JsValue::undefined())
    //             .unwrap()
    //             .dyn_into::<Promise>()
    //             .unwrap()
    //         .await;
    //     }
    // });

    // thread2 is exactly the same except we use js_sys::futures to spawn
    // let thread2 = wasm_bindgen_spawn::spawn_async(|| async {
    //     let sleep = Function::new_no_args("return new Promise(r=>setTimeout(r,1000))");
    //     let sleep2 = sleep.clone();
    //     js_sys::futures::spawn_local(async move {
    //         let _ = sleep
    //             .call0(&JsValue::undefined())
    //             .unwrap()
    //             .dyn_into::<Promise>()
    //             .unwrap()
    //         .await;
    //         panic!("test async panic from thread2!");
    //     });
    //     // ensure this context outlives the other task that will panic 
    //     for _ in 0..3 {
    //         let _ = sleep2
    //             .call0(&JsValue::undefined())
    //             .unwrap()
    //             .dyn_into::<Promise>()
    //             .unwrap()
    //         .await;
    //     }
    // });

    // thread1 will receive the panic info
    // match thread1.join() {
    //     Ok(()) => harness::log(log_context, "{\"thread1\":\"ok\"}"),
    //     Err(e) => {
    //         let msg = harness::panic_info(&e);
    //         harness::log(log_context, &format!("{{\"thread1\":\"err\",\"msg\":{msg:?}}}"))
    //     }
    // }

    // // thread2 ignores the panic since the local task is spawned directly
    // // onto the JS runtime and not hooked into the worker runtime of wasm-bindgen-spawn
    // match thread2.join() {
    //     Ok(()) => harness::log(log_context, "{\"thread2\":\"ok\"}"),
    //     Err(e) => {
    //         let msg = harness::panic_info(&e);
    //         harness::log(log_context, &format!("{{\"thread2\":\"err\",\"msg\":{msg:?}}}"))
    //     }
    // }


    // -------- in the example you may ignore the harness calls; they are for tests only
    harness::log("test-end", "example_async_panic");
}
