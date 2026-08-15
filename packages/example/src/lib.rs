use std::any::Any;
use std::panic::PanicHookInfo;
use std::thread;

use wasm_bindgen::prelude::*;

/// The harness for sending data to tests
mod harness;

// #[inline]
// pub fn set_once() {
//     use std::sync::Once;
//     static SET_HOOK: Once = Once::new();
//     SET_HOOK.call_once(|| {
//         std::panic::set_hook(Box::new(hook));
//     });
// }
//
// fn hook(info: &PanicHookInfo) {
//     harness::error(&info.to_string());
// }

#[wasm_bindgen]
pub async fn init_thread_creator(harness: &str, bg_js: JsValue, _wasm_module: JsValue) -> bool {
    // setup logging harness for testing
    
    // first hook up panic messages to the logging harness,
    // so that our tests can assert a panic happened with the correct message
    // in a real app you might want to hook it up to console.error or some
    // other means to see the panic message (for example with
    // the `console_error_panic_hook crate` crate)
    // std::panic::set_hook(Box::new(|info| {
    //     harness::log("panic", &info.to_string());
    // }));
        // std::panic::set_hook(Box::new(harness::log_panic));
    // console_error_panic_hook::set_once();
    // set_once();

    match harness {
        "console" => harness::init_console(),
        "node-fs" => harness::init_node_fs(),
        other => {
            harness::error(format!("invalid harness type: {other}"));
            return false;
        }
    }

    let id = thread::current().id();
    harness::log("init-main-thread-id", &format!("{id:?}"));

    #[cfg(feature = "no-wbg-module")]
    let init = wasm_bindgen_spawn::init_bg_no_modules(bg_js, _wasm_module);
    #[cfg(not(feature = "no-wbg-module"))]
    let init = wasm_bindgen_spawn::init_bg_no_modules(bg_js, wasm_bindgen::module());

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
    let mut handles = vec![];
    let id = thread::current().id();
    for i in 1..=5 {
        harness::log("info", &format!("spawning thread {i} on main_thread={id:?})"));
        let handle = wasm_bindgen_spawn::spawn(move || {
            // set_once();
        // std::panic::set_hook(Box::new(hook));
            let id = thread::current().id();
            harness::log("info", &format!("thread {i} started id={id:?}"));
            if i == 2 {
                panic!("hey, I'm 2 (this is a test panic)");
            }

            i * 3
        });
        handles.push(handle);
    }
    for handle in handles {
        match handle.join() {
            Ok(value) => harness::log("info", &format!("worker thread returned: {value}")),
            Err(e) => {
                let e = best_effort_panic_info(&e);
                harness::log("info", &format!("worker thread failed: {e}"));
            }
        }
    }

    harness::log("test-end", "example_join_handle");

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
