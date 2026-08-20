use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, mpsc};

use wasm_bindgen::prelude::*;

use crate::harness;

/// Spawn many threads to atomicly operate on the same integer
/// note: this large number of threads is just for demo
/// spawning worker is expensive. You should pool the threads
#[wasm_bindgen]
pub fn example_arc_atomic() {
    harness::log("test-start", "example_arc_atomic");
    let log_context = "test-log:example_arc_atomic";
    // -------- in the example you may ignore the harness calls; they are for tests only

    let counter = Arc::new(AtomicUsize::new(0));
    let num_threads = 30;
    let mut handles = vec![];
    for _ in 0..num_threads {
        let counter = counter.clone();
        let handle = wasm_bindgen_spawn::spawn(move || {
            // relaxed is fine since we are not using atomics for
            // synchronization of other objects
            let prev = counter.fetch_add(1, Ordering::Relaxed);
            harness::log(log_context, &format!("{{\"prev\":{prev}}}"));
        });
        handles.push(handle);
    }

    let sum = counter.load(Ordering::Relaxed);
    harness::log(log_context, &format!("{{\"sum_before_join\":{sum}}}"));
    for x in handles {
        x.join().unwrap();
    }
    let sum = counter.load(Ordering::Relaxed);
    harness::log(log_context, &format!("{{\"sum_after_join\":{sum}}}"));

    // -------- in the example you may ignore the harness calls; they are for tests only
    harness::log("test-end", "example_arc_atomic");
}

/// Spawn 4 threads as a thread pool; the main thread sends
/// tasks for each thread to operate on the atomic integer
#[wasm_bindgen]
pub fn example_arc_atomic_pooled() {
    harness::log("test-start", "example_arc_atomic_pooled");
    let log_context = "test-log:example_arc_atomic_pooled";
    // -------- in the example you may ignore the harness calls; they are for tests only

    let counter = Arc::new(AtomicUsize::new(0));
    let num_threads = 4;
    let mut handles = vec![];
    let mut senders = vec![];
    for _ in 0..num_threads {
        let counter = counter.clone();
        let (send, recv) = mpsc::channel::<usize>();
        let h = wasm_bindgen_spawn::spawn(move || {
            for i in recv {
                counter.fetch_add(i, Ordering::Relaxed);
            }
        });
        handles.push(h);
        senders.push(send);
    }
    // send the "tasks"
    for i in 0..1000 {
        let j = i % num_threads;
        senders[j].send(i).unwrap();
    }
    drop(senders);

    for x in handles {
        x.join().unwrap();
    }
    // sum should be 499,500
    let sum = counter.load(Ordering::Relaxed);
    harness::log(log_context, &format!("{{\"sum_after_join\":{sum}}}"));

    // -------- in the example you may ignore the harness calls; they are for tests only
    harness::log("test-end", "example_arc_atomic_pooled");
}
