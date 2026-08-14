use std::any::Any;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &JsValue);
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn log_str(s: &str);
    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &JsValue);
}


#[wasm_bindgen]
pub async fn init_thread_creator(bg_js: JsValue, _wasm_module: JsValue) -> bool {
    console_error_panic_hook::set_once();
    let init = wasm_bindgen_spawn::init_bg_no_modules(bg_js);
    #[cfg(feature = "no-wbg-module")]
    let result = init.ready(_wasm_module).await;
    #[cfg(not(feature = "no-wbg-module"))]
    let result = init.ready().await;

    if let Err(e) = result {
        error(&e);
        return false;
    }
    true
}

#[wasm_bindgen]
pub fn example_join_handle() {
    let mut handles = vec![];
    for i in 1..=5 {
        log_str(&format!("spawning: {i}"));
        let handle = wasm_bindgen_spawn::spawn(move || {
                log_str(&format!("Worker {i} thread started"));
                if i == 2 {
                    panic!("Hey, I'm 2 (this is a test panic)");
                }

                i * 3
            });
        handles.push(handle);
    }

    for handle in handles {
        match handle.join() {
            Ok(value) => log_str(&format!("Worker thread returned: {value}")),
            Err(e) => {
                let e = best_effort_panic_info(&e);
                log_str(&format!("Worker thread failed: {e}"));
            }
        }
    }

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

