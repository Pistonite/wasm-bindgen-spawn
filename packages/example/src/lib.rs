// this let's us log thread id in the test harness without over complicating it
// with printing to the debug (:?) first
#![feature(thread_id_value)]

use std::thread;

use wasm_bindgen::prelude::*;

/// The harness for sending data to tests
mod harness;

// !!! LOOK HERE !!!
// To see examples please see the examples/ directory
mod examples;

#[wasm_bindgen]
pub async fn init_thread_creator(
    harness: &str,
    bg_target: &str,
    bg_js: JsValue,
    _wasm_module: JsValue,
) -> bool {
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
pub fn uninit() {
    wasm_bindgen_spawn::terminate_dispatcher();
}
