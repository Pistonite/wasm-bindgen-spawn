use std::any::Any;
use std::cell::RefCell;
use std::sync::Mutex;

use js_sys::{Function, JsString};
use wasm_bindgen::prelude::*;

static LOGS: Mutex<String> = Mutex::new(String::new());

thread_local! {
    // since the harness stores a serialization function implemented in JS
    // it needs to be thread local
    static HARNESS: RefCell<Option<Harness>> = const { RefCell::new(None) };
}
fn with_harness<F: FnOnce(&Harness)>(f: F) {
    HARNESS.with_borrow_mut(|x| match x {
        None => {
            let harness = Harness::new();
            f(&harness);
            *x = Some(harness);
        }
        Some(x) => {
            f(x);
        }
    })
}

pub fn init() {
    // first hook up panic messages to the logging harness,
    // so that our tests can assert a panic happened with the correct message
    // in a real app you might want to hook it up to console.error or some
    // other means to see the panic message (for example with
    // the `console_error_panic_hook crate` crate)
    std::panic::set_hook(Box::new(move |info| {
        let harness = Harness::new();
        let info = info.to_string();
        harness.log("panic", &info);
        // easier to debug
        console_error_str(&info);
    }));
}

/// Read the log snapshot
pub fn snapshot() -> String {
    LOGS.lock().unwrap().clone()
}

pub fn log(tag: &str, s: &str) {
    with_harness(|x| x.log(tag, s));
}
pub fn error(s: impl Into<JsValue>) {
    let s = s.into();
    with_harness(|x| x.error(&s));
}
struct Harness {
    serialize_fn: Function,
    #[cfg(feature = "harness-broadcast")]
    broadcast_fn: Function,
}
impl Harness {
    fn new() -> Self {
        let serialize_fn = Function::new_with_args("ARG", include_str!("serialize.js"));

        #[cfg(feature = "harness-broadcast")]
        {
            Self {
                serialize_fn,
                broadcast_fn: Function::new_no_args(include_str!("broadcast.js"))
                    .call0(&JsValue::undefined())
                    .unwrap()
                    .dyn_into::<Function>()
                    .unwrap(),
            }
        }

        #[cfg(not(feature = "harness-broadcast"))]
        Self { serialize_fn }
    }
    fn log(&self, tag: &str, x: &str) {
        self.emit(x.into(), tag.into());
    }
    fn error(&self, x: &JsValue) {
        self.emit(x.clone(), "error".into());
    }
    fn emit(&self, s: JsValue, tag: JsValue) {
        let thread_id = u64::from(std::thread::current().id().as_u64()) as u32;
        let args = JsValue::from(vec![s, tag, thread_id.into()]);

        match self
            .serialize_fn
            .call1(&JsValue::undefined(), &args)
            .and_then(|x| x.dyn_into::<JsString>())
        {
            Ok(v) => {
                #[cfg(feature = "harness-broadcast")]
                {
                    let v = JsValue::from(v.clone());
                    let _ = self.broadcast_fn.call1(&JsValue::undefined(), &v);
                }
                let rs_string: String = v.into();
                let mut logs = LOGS.lock().unwrap();
                // uncomment to debug
                // console_log_str(&rs_string);
                logs.push_str(&rs_string);
                logs.push('\n');
            }
            Err(_) => console_error_str("harness: failed to serialize emit payload"),
        }
    }
}

pub fn panic_info<'a>(payload: &'a Box<dyn Any + Send + 'static>) -> &'a str {
    if let Some(s) = payload.downcast_ref::<&str>() {
        s
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.as_str()
    } else {
        "unknown panic info"
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn console_log_str(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error_str(s: &str);
}
