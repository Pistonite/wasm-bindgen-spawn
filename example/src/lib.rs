use std::{
    cell::OnceCell,
    sync::{Arc, Mutex, atomic::AtomicUsize},
};

use js_sys::Function;
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

thread_local! {
    static THREAD_CREATOR: OnceCell<Arc<ThreadCreator>> = const { OnceCell::new() };
}

#[wasm_bindgen]
pub async fn init_wasm_module() {
    console_error_panic_hook::set_once();
    let thread_creator = match ThreadCreator::unready("pkg/example_bg.wasm", "pkg/example.js") {
        Ok(v) => v,
        Err(e) => {
            log_str("Failed to create thread creator");
            error(&e);
            return;
        }
    };
    let thread_creator = match thread_creator.ready().await {
        Ok(v) => v,
        Err(e) => {
            log_str("Failed to create thread creator");
            error(&e);
            return;
        }
    };
    THREAD_CREATOR.with(|cell| {
        let _ = cell.set(Arc::new(thread_creator));
    });
}

fn thread_creator() -> Arc<ThreadCreator> {
    THREAD_CREATOR.with(|cell| Arc::clone(cell.get().unwrap()))
}

macro_rules! example {
    ($name:ident, $body:block) => {
        #[wasm_bindgen]
        pub fn $name() {
            log_str("-----------------------------------------");
            log_str(concat!("Example:", stringify!($name)));
            $body;
            log_str("-----------------------------------------");
        }
    };
}

example!(example_sleep, {
    let tc = thread_creator();
    let mut handles = vec![];
    for i in 0..5 {
        log_str(&format!("Spawning: {i}"));
        let h = tc
            .spawn(move || {
                log_str(&format!("Sleeping: {i}"));
                std::thread::sleep(std::time::Duration::from_secs(1));
                log_str(&format!("Woke up: {i}"));
            })
            .unwrap();
        handles.push(h);
    }
    log_str("Spawned all threads");
    for (i, x) in handles.into_iter().enumerate() {
        x.join().unwrap();
        log_str(&format!("Joined: {i}"));
    }
});

example!(example_mutex_poison, {
    let tc = thread_creator();
    let v = Arc::new(Mutex::new(Vec::<i32>::new()));
    let handle = {
        let v = v.clone();
        tc.spawn(move || {
            let mut v = v.lock().unwrap();
            v.push(1);
            panic!("This is a test panic");
        })
        .unwrap()
    };
    match handle.join() {
        Ok(_) => log_str("Should see a panic but didn't"),
        Err(e) => log_str(&format!("Panic (expected): {e:?}")),
    }

    match v.lock() {
        Ok(_) => log_str("Should see a poisoned error but didn't"),
        Err(e) => log_str(&format!("Poisoned (expected): {e:?}")),
    };
});
