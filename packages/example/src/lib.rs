
// this let's us log thread id in the test harness without over complicating it
// with printing to the debug (:?) first
#![feature(thread_id_value)]
use std::any::Any;
use std::thread;
use std::time::Duration;

use wasm_bindgen::prelude::*;

/// The harness for sending data to tests
mod harness;

#[wasm_bindgen]
pub async fn init_thread_creator(harness: &str, bg_target: &str, bg_js: JsValue, _wasm_module: JsValue) -> bool {
    // setup logging harness for testing
    match harness {
        "console" => harness::init_console(),
        "node-fs" => harness::init_node_fs(),
        "fetch" => harness::init_fetch(),
        other => {
            harness::error(format!("invalid harness type: {other}"));
            return false;
        }
    }

    let id = thread::current().id();
    harness::log("init-main-thread-id", &format!("{id:?}"));

    let init = match bg_target {
        "no-modules" => {
            #[cfg(feature = "no-wbg-module")]
            let init = wasm_bindgen_spawn::init_bg_no_modules(bg_js, _wasm_module);
            #[cfg(not(feature = "no-wbg-module"))]
            let init = wasm_bindgen_spawn::init_bg_no_modules(bg_js, wasm_bindgen::module());
            init
        }
        "web" => {
            #[cfg(feature = "no-wbg-module")]
            let init = wasm_bindgen_spawn::init_bg_web(bg_js, _wasm_module);
            #[cfg(not(feature = "no-wbg-module"))]
            let init = wasm_bindgen_spawn::init_bg_web(bg_js, wasm_bindgen::module());
            init
        }
        other => {
            harness::error(format!("invalid bg_target: {other}"));
            return false;
        }
    };

    let result = init.create_dispatcher().await;

    if let Err(e) = result {
        harness::error(e);
        return false;
    }
    true
}

#[wasm_bindgen]
pub fn example_join_handle() {
    harness::log("test-start", "example_join_handle");
    let log_context = "test-log:example_join_handle";
    let mut handles = vec![];
    for i in 1..=5 {
        harness::log(log_context, &format!("{{\"spawning_thread\":{i}}}"));
        let handle = wasm_bindgen_spawn::spawn(move || {
            harness::log(log_context, &format!("{{\"thread_start\":{i}}}"));
            if i == 2 {
                panic!("hey, I'm 2 (this is a test panic)");
            }

            i * 3
        });
        handles.push(handle);
    }
    for handle in handles {
        match handle.join() {
            Ok(value) => {
            harness::log(log_context, &format!("{{\"thread_return\":{value}}}"));
            }
            Err(e) => {
                let e = best_effort_panic_info(&e);
                harness::log(log_context, &format!("{{\"thread_panic\":{e:?}}}"));
            }
        }
    }

    harness::log("test-end", "example_join_handle");
}
#[wasm_bindgen]
pub fn example_mpsc_channel() {
    harness::log("test-start", "example_mpsc_channel");
    let log_context = "test-log:example_mpsc_channel";

    let (send, recv) = std::sync::mpsc::channel();
    for i in 0..3 {
        harness::log(log_context, &format!("{{\"spawning_thread\":{i}}}"));
        let send = send.clone();
        wasm_bindgen_spawn::spawn(move || {
            harness::log(log_context, &format!("{{\"thread_start\":{i}}}"));
            for j in 0..3 {
                std::thread::sleep(Duration::from_millis(500));
                let payload = i * 3 + j;
                harness::log(log_context, &format!("{{\"thread_sending\":{payload}}}"));
                send.send(payload).unwrap();
            }
            harness::log(log_context, &format!("{{\"thread_done\":{i}}}"));
        });
    }
    drop(send);
    for i in recv {
        harness::log(log_context, &format!("{{\"received\":{i}}}"));
    }
    harness::log("test-end", "example_mpsc_channel");
}

#[wasm_bindgen]
pub fn uninit() {
    wasm_bindgen_spawn::terminate_dispatcher();
}

fn best_effort_panic_info<'a>(payload: &'a Box<dyn Any + Send + 'static>) -> &'a str {
    if let Some(s) = payload.downcast_ref::<&str>() {
        s
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.as_str()
    } else {
        "unknown panic info"
    }
}
