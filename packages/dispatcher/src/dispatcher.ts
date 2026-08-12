// The code for the dispatcher worker

import type { WasmBindgen } from "./binding.gen.ts";
import {
    type DispatcherInitMessage,
    WORKER_MSG_PANIC,
    WORKER_MSG_READY,
    WORKER_MSG_SUCCESS,
    type WorkerInitMessage,
} from "./types.ts";
declare const wasm_bindgen: WasmBindgen;

self.onmessage = async (e) => {
    const { recv, start_send, url, memory, wasm } = e.data as DispatcherInitMessage;
    // initialize wasm with the same memory object to share memory
    await wasm_bindgen({ memory, module_or_path: wasm });
    // safety: start_send is sent from create.ts which ultimately comes
    // from ThreadCreator::unready
    wasm_bindgen.__unsafe_pistonite_wbgspawn_send_signal(start_send);
    while (true) {
        // block on the mpsc channel to receive spawn requests
        const p = wasm_bindgen.__pistonite_wbgspawn_dispatch_recv(recv);
        // the sender (ThreadCreator) is dropped, terminate the dispatcher
        if (!p) {
            break;
        }
        const [f, send, next_start_send, next_start_recv] = p;
        // spawn the web worker which is responsible for driving
        // the thread, wait for the worker context to start executing
        await new Promise<void>((resolve) => {
            const worker = new Worker(url);
            worker.onmessage = ({ data }) => {
                switch (data) {
                    case WORKER_MSG_READY:
                        // worker context started executing which means
                        // the messaging is ready, send the stuff to run the thread
                        worker.postMessage({
                            f,
                            send,
                            start: next_start_send,
                            memory,
                            wasm,
                        } satisfies WorkerInitMessage);
                        return resolve();
                    case WORKER_MSG_SUCCESS:
                        // on success the value is already sent to Rust,
                        // terminate the worker
                        worker.terminate();
                        return;
                    case WORKER_MSG_PANIC:
                        // on hard panic we need to use the sender
                        // reference which should still be valid in memory
                        // despite the panic, to notify the join handle
                        // about the panic
                        wasm_bindgen.__pistonite_wbgspawn_worker_send_panic(send);
                        worker.terminate();
                        return;
                }
            };
        });
        // similar to the comment in create.ts, if we block the dispatcher
        // immediately for receiving the next spawn request, the postMessage
        // could never fire and thus never spawn the thread onto the worker,
        // so we poll for a signal from the worker that the postMessage
        // was received, and then start blocking on the next iteration of the while(true)
        // loop
        //
        // safety: next_start_send/recv is created in _dispatch_recv where into_js is called
        while (!wasm_bindgen.__unsafe_pistonite_wbgspawn_poll_signal(next_start_recv)) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    // clean up the dispatcher
    wasm_bindgen.__pistonite_wbgspawn_dispatch_drop(recv);
    self.postMessage(WORKER_MSG_SUCCESS);
};
self.postMessage(WORKER_MSG_READY);
