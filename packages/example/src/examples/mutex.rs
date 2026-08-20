use std::sync::{Arc, Mutex};

use wasm_bindgen::prelude::*;

use crate::harness;

/// Using 2 threads to write to the same vector protected by a mutex,
/// and observe a section of interleaving values
#[wasm_bindgen]
pub fn example_mutex() {
    harness::log("test-start", "example_mutex");
    let log_context = "test-log:example_mutex";
    // -------- in the example you may ignore the harness calls; they are for tests only

    let v = Arc::new(Mutex::new(Vec::<i32>::new()));
    let count = 5000;
    let mut handles = vec![];
    for i in 0..2 {
        let v = v.clone();
        let r = wasm_bindgen_spawn::spawn(move || {
            for _ in 0..count {
                {
                    let mut v = v.lock().unwrap();
                    v.push(i);
                }

                // it's not reliable to see the interleave even with a large
                // count if we don't sleep (especially in release mode,
                // but also sometimes in debug mode in some engines)
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
        });
        handles.push(r);
    }
    for x in handles {
        x.join().unwrap()
    }
    let (len, pos, sample) = {
        let v = v.lock().unwrap();
        let len = v.len();
        // find where interleave starts
        let pos = v.iter().position(|&x| x == 1).unwrap();
        let sample = format!("{:?}", &v[pos..pos + 100]);
        (len, pos, sample)
    };

    harness::log(log_context, &format!("{{\"vec_length\":{len}}}"));
    harness::log(log_context, &format!("{{\"interleave_pos\":{pos}}}"));
    harness::log(log_context, &format!("{{\"interleave_sample\":{sample}}}"));

    // -------- in the example you may ignore the harness calls; they are for tests only
    harness::log("test-end", "example_mutex");
}
