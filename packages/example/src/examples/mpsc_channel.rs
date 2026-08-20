use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use wasm_bindgen::prelude::*;

use crate::harness;

/// create a mpsc (multi-producer-single-consumer) channel
/// and spawn 3 threads to each send the main thread many values
#[wasm_bindgen]
pub fn example_mpsc_channel() {
    harness::log("test-start", "example_mpsc_channel");
    let log_context = "test-log:example_mpsc_channel";
    // -------- in the example you may ignore the harness calls; they are for tests only

    let (send, recv) = mpsc::channel();

    for i in 0..3 {
        harness::log(log_context, &format!("{{\"spawning_thread\":{i}}}"));

        let send = send.clone();
        wasm_bindgen_spawn::spawn(move || {
            harness::log(log_context, &format!("{{\"thread_start\":{i}}}"));

            for j in 0..3 {
                // adding a delay to see interleaving in the log
                // see the mutex example for a brute-forced interleaving
                // without delay to show the threads are actually running in parallel
                thread::sleep(Duration::from_millis(500));

                let payload = i * 3 + j;
                harness::log(log_context, &format!("{{\"thread_sending\":{payload}}}"));
                send.send(payload).unwrap();
            }

            harness::log(log_context, &format!("{{\"thread_done\":{i}}}"));
        });
    }
    // drop our own copy of the sender so the recv iterator below
    // terminates when the sender from all threads are dropped
    drop(send);

    for i in recv {
        harness::log(log_context, &format!("{{\"received\":{i}}}"));
    }

    // -------- in the example you may ignore the harness calls; they are for tests only
    harness::log("test-end", "example_mpsc_channel");
}
