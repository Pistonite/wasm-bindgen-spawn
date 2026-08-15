use std::cell::RefCell;
use std::panic::PanicHookInfo;
use std::sync::{Mutex, OnceLock};

use js_sys::Function;
use wasm_bindgen::prelude::*;

pub fn init_console() {
    init_harness_script("console.log(ARG)")
}
pub fn init_node_fs() {
    init_harness_script("fs.appendFileSync(globalThis.__harness_output_path,ARG+'\\n','utf8')")
}

pub fn log(tag: &str, s: &str) {
    with_harness(|x| x.log(tag, s));
}
pub fn log_value(s: &JsValue) {
    with_harness(|x| x.log_value(s));
}
pub fn error(s: impl Into<JsValue>) {
    let s = s.into();
    if !with_harness(|x| x.error(&s)) {
        console_error(&s);
    }
}
// pub fn log_panic(info: &PanicHookInfo) {
//     let info = info.to_string();
//     // need to create a new harness on the spot
//     // because thread locals are not accessible at this point
//     match HARNESS_SCRIPT.get() {
//         Some(script) => {
//             let harness = Harness::new(script);
//             harness.log("panic", &info)
//         }
//         None => {
//             console_error_str("harness not initialized");
//         }
//     }
// }
static HARNESS_SCRIPT: OnceLock<String> = OnceLock::new();
fn init_harness_script(script: &str) {
    let script = script.to_string();
    let _ = HARNESS_SCRIPT.set(script.clone());

    std::panic::set_hook(Box::new(move |info| {
        let harness = Harness::new(&script);
        let info = info.to_string();
        let tag = JsValue::from("panic");
        // let info = JsValue::from(&info);
            console_error(&tag);
            console_error_str(&info);
        // harness.log("panic", &info);
        //     console_error_str(&info);
    }));
}
thread_local! {
    static HARNESS: RefCell<Option<Harness>> = RefCell::new(None);
}
fn with_harness<F: FnOnce(&Harness)>(f: F) -> bool {
    HARNESS.with_borrow_mut(|x| {
        match x {
            None => {
                match HARNESS_SCRIPT.get() {
                    Some(script) => {
                        let harness = Harness::new(script);
                        f(&harness);
                        *x = Some(harness);
                        true
                    }
                    None => {
                        console_error_str("harness not initialized");
                        false
                    }
                }
            }
            Some(x) => {
                f(x);
                true
            }
        }
    })
}
struct Harness {
    serialize_fn: Function,
    emit_fn: Function
}
impl Harness {
    fn new(emit_script: &str) -> Self {
        let serialize_fn = Function::new_with_args("ARG", include_str!("serialize.js"));
        let emit_fn = Function::new_with_args("ARG", emit_script);
        Self {
            serialize_fn, emit_fn
        }
    }
    fn log(&self, tag: &str, x: &str) {
        self.emit(x.into(), tag.into());
    }
    fn log_value(&self, x: &JsValue) {
        self.emit(x.clone(), "log".into());
    }
    fn error(&self, x: &JsValue) {
        self.emit(x.clone(), "error".into());
    }
    fn emit(&self, s: JsValue, tag: JsValue) {
                    // console_error_str("harness: emitting");
                    // console_error(&tag);
                    // console_error(&s);
                    // console_error_str("--");
        let args = 
            JsValue::from(vec![
            s, tag
        ]
            );
        
        match self.serialize_fn.call1(&JsValue::undefined(), &args) {
            Ok(v) => {
                if let Err(_) = self.emit_fn.call1(&JsValue::undefined(), &v) {
                    console_error_str("harness: failed to emit payload");
                }
            }
            Err(_) => {
                console_error_str("harness: failed to serialize emit payload")
            }
        }
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn console_log(s: &JsValue);
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn console_log_str(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error(s: &JsValue);
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error_str(s: &str);
}
