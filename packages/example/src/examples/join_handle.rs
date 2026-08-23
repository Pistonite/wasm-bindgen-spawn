use wasm_bindgen::prelude::*;

use crate::harness;

/// Spawn 5 threads, collecting their handles in a vec,
/// then join them in order.
#[wasm_bindgen]
pub fn example_join_handle() {
    let l = line!();
    harness::log("test-src", &format!("example_join_handle={}:{l}", file!()));
    harness::log("test-start", "example_join_handle");
    let log_context = "test-log:example_join_handle";
    // -------- in the example you may ignore the harness calls; they are for tests only

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
                let e = harness::panic_info(&e);
                harness::log(log_context, &format!("{{\"thread_panic\":{e:?}}}"));
            }
        }
    }

    // -------- in the example you may ignore the harness calls; they are for tests only
    harness::log("test-end", "example_join_handle");
}
