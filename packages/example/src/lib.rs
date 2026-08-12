use std::cell::OnceCell;

use wasm_bindgen::prelude::*;
use wasm_bindgen_spawn::ThreadCreator;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &JsValue);
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn log_str(s: &str);
    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &JsValue);
}

// a wrapper to workaround OnceCell not being Sync, so we can declare a global
// for it. this is fine as long as we are not actually accessing the global
// from multiple threads. Alternatively, use OnceLock if you are uncomfortable
// or unsure about when OnceCell is safe.
//
// The ThreadCreator itself is Send + Sync, and implements Clone
// so you can clone it and pass it to multiple places/threads where you need
// to spawn new threads.
struct GlobalThreadCreator(OnceCell<ThreadCreator>);
unsafe impl Sync for GlobalThreadCreator {}
impl std::ops::Deref for GlobalThreadCreator {
    type Target = ThreadCreator;
    fn deref(&self) -> &Self::Target {
        self.0.get().unwrap()
    }
}
static THREAD_CREATOR: GlobalThreadCreator = GlobalThreadCreator(OnceCell::new());

#[wasm_bindgen]
pub async fn init_thread_creator() -> bool {
    console_error_panic_hook::set_once();
    let thread_creator = match ThreadCreator::unready("pkg/example_bg.wasm", "pkg/example.js") {
        Ok(v) => v,
        Err(e) => {
            log_str("Failed to create thread creator");
            error(&e);
            return false;
        }
    };
    let thread_creator = match thread_creator.ready().await {
        Ok(v) => v,
        Err(e) => {
            log_str("Failed to wait for thread creator ready");
            error(&e);
            return false;
        }
    };
    let _ = THREAD_CREATOR.0.set(thread_creator);

    true
}

pub fn example_join_handle() {
    let mut handles = vec![];
    for i in 1..=5 {
        log_str(&format!("spawning: {i}"));
        let handle = THREAD_CREATOR
            .spawn(move || {
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
