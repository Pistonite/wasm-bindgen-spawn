use std::cell::RefCell;
use std::sync::OnceLock;

use js_sys::Function;
use wasm_bindgen::prelude::*;

pub fn init_console() {
    // this is mainly for debugging to just print the payload in the JS console
    // however note that console.log is tied to the JS Event Loop and some runtime
    // may not process it when *any* thread is blocked on atomics (looking at you node)
    init_harness_script("console.log(ARG)")
}
pub fn init_node_fs() {
    // feed the payload through node:fs exposed as globalThis.__fs
    init_harness_script("globalThis.__fs.appendFileSync(globalThis.__harness_output_path,ARG+'\\n','utf8')")
}
pub fn init_fetch() {
    // feed the payload through a POST request to a webserver
    init_harness_script("globalThis.fetch(globalThis.__harness_fetch_endpoint,{method:'POST',body:ARG})")
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
static HARNESS_SCRIPT: OnceLock<String> = OnceLock::new();
fn init_harness_script(script: &str) {
    let script = script.to_string();
    let _ = HARNESS_SCRIPT.set(script.clone());

    // first hook up panic messages to the logging harness,
    // so that our tests can assert a panic happened with the correct message
    // in a real app you might want to hook it up to console.error or some
    // other means to see the panic message (for example with
    // the `console_error_panic_hook crate` crate)
    std::panic::set_hook(Box::new(move |info| {
        let harness = Harness::new(&script);
        let info = info.to_string();
        harness.log("panic", &info);
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
        let thread_id = u64::from(std::thread::current().id().as_u64()) as u32;
        let args = 
            JsValue::from(vec![
            s, tag, thread_id.into(),
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
