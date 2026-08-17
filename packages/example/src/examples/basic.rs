use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use crate::harness;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn example_available_parallelism() {
    harness::log("test-start", "example_available_parallelism");
    let log_context = "test-log:example_available_parallelism";
    // -------- in the example you may ignore the harness calls; they are for tests only

    // not supported - use navigator.hardwareConcurrency
    // https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency
    let x = thread::available_parallelism().is_err();
    harness::log(log_context, &format!("{{\"available_parallelism\":{x}}}"));
    harness::log("test-end", "example_available_parallelism");
}

#[wasm_bindgen]
pub fn example_join_handle() {
    harness::log("test-start", "example_join_handle");
    let log_context = "test-log:example_join_handle";
    // -------- in the example you may ignore the harness calls; they are for tests only

    // spawn 5 threads, collecting their handles in a vec,
    // then join them in order.

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

#[wasm_bindgen]
pub fn example_mpsc_channel() {
    harness::log("test-start", "example_mpsc_channel");
    let log_context = "test-log:example_mpsc_channel";
    // -------- in the example you may ignore the harness calls; they are for tests only

    // create a mpsc (multi-producer-single-consumer) channel
    // and spawn 3 threads to each send the main thread many values

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
