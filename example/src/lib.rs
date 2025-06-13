use std::{
    cell::OnceCell,
    sync::{atomic::AtomicUsize, Arc, Mutex},
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

example!(example_join_handle, {
    let tc = thread_creator();
    let mut handles = vec![];
    for i in 1..=5 {
        log_str(&format!("spawning: {i}"));
        let handle = tc
            .spawn(move || {
                log_str(&format!("Worker {i} thread started"));
                if i == 2 {
                    panic!("Hey, I'm 2 (this is a test panic)");
                }

                i * 3
            })
            .unwrap();
        handles.push(handle);
    }

    for handle in handles {
        match handle.join() {
            Ok(value) => log_str(&format!("Worker thread returned: {value}")),
            Err(e) => log_str(&format!("Worker thread failed: {e}")),
        }
    }
});

example!(example_mpsc_channel, {
    let tc = thread_creator();
    let (send, recv) = std::sync::mpsc::channel();
    for i in 0..10 {
        let send = send.clone();
        log_str(&format!("Spwaning: {i}"));

        tc.spawn(move || {
            log_str(&format!("Sending: {i}"));
            send.send(i).unwrap();
        })
        .unwrap();
    }
    drop(send);
    for i in recv {
        log_str(&format!("Received: {i}"));
    }
});

example!(example_atomic_usize, {
    let tc = thread_creator();
    let counter = Arc::new(AtomicUsize::new(0));
    // note: this large number of threads is just for demo
    // spawning worker is expensive. You should pool the threads
    log_str("Spawning 50 threads");
    let mut handles = vec![];
    for _ in 0..50 {
        let counter = counter.clone();
        let h = tc
            .spawn(move || {
                counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            })
            .unwrap();
        handles.push(h);
    }
    let sum = counter.load(std::sync::atomic::Ordering::Relaxed);
    log_str(&format!("Without joining, sum is : {sum}"));
    for x in handles {
        x.join().unwrap();
    }
    let sum = counter.load(std::sync::atomic::Ordering::Relaxed);
    log_str(&format!("After joining, sum is: {sum}"));
});
example!(example_atomic_usize_pooled, {
    let tc = thread_creator();
    let counter = Arc::new(AtomicUsize::new(0));
    let num = Function::new_no_args("return navigator.hardwareConcurrency")
        .call0(&JsValue::null())
        .unwrap()
        .as_f64()
        .unwrap() as usize;

    log_str(&format!("Spawning {num} threads for 1000 tasks"));
    let mut handles = vec![];
    let mut senders = vec![];
    for _ in 0..num {
        let counter = counter.clone();
        let (send, recv) = std::sync::mpsc::channel::<usize>();
        let h = tc
            .spawn(move || {
                for i in recv {
                    counter.fetch_add(i, std::sync::atomic::Ordering::Relaxed);
                    log_str("incremented");
                }
            })
            .unwrap();
        handles.push(h);
        senders.push(send);
    }
    for i in 0..1000 {
        let j = i % num;
        senders[j].send(1).unwrap();
    }
    drop(senders);
    let sum = counter.load(std::sync::atomic::Ordering::Relaxed);
    log_str(&format!("Without joining, sum is : {sum}"));
    for x in handles {
        x.join().unwrap();
    }
    let sum = counter.load(std::sync::atomic::Ordering::Relaxed);
    log_str(&format!("After joining, sum is: {sum}"));
});

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

example!(example_mutex, {
    let tc = thread_creator();
    let v = Arc::new(Mutex::new(Vec::<i32>::new()));
    let mut handles = vec![];
    let count = 5000000;
    for i in 0..2 {
        let v = v.clone();
        let r = tc
            .spawn(move || {
                for _ in 0..count {
                    {
                        let mut v = v.lock().unwrap();
                        v.push(i);
                    }

                    // if the count above is too large for you to run, try uncomment
                    // the following sleep to see interleaving with a lower count
                    // std::thread::sleep(std::time::Duration::from_millis(1));
                }
            })
            .unwrap();
        handles.push(r);
    }
    for x in handles {
        x.join().unwrap()
    }
    {
        let v = v.lock().unwrap();
        log_str(&format!("Length: {}", v.len()));
        // find where interleave starts
        let pos = v.iter().position(|&x| x == 1).unwrap();
        if pos == count {
            log_str("No interleaving");
        } else {
            log_str(&format!(
                "Interleave section : {:?}",
                &v[pos..v.len() - pos]
            ));
        }
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
