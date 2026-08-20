use std::thread;

use wasm_bindgen::prelude::*;

use crate::harness;

/// Not supported - use navigator.hardwareConcurrency
/// https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency
#[wasm_bindgen]
pub fn example_available_parallelism() {
    harness::log("test-start", "example_available_parallelism");
    let log_context = "test-log:example_available_parallelism";
    // -------- in the example you may ignore the harness calls; they are for tests only

    let x = thread::available_parallelism().is_err();
    harness::log(log_context, &format!("{{\"available_parallelism\":{x}}}"));
    harness::log("test-end", "example_available_parallelism");
}
