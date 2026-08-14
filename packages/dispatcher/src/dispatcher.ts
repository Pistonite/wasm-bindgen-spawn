// The code for the dispatcher worker

import { createWorker, getWorkerGlobalScope } from "./shared.ts";
import {
    WORKER_MSG_PANIC,
    WORKER_MSG_READY,
    WORKER_MSG_SUCCESS,
    type WorkerInitArgs,
    type DispatcherInitMessage,
    type WorkerInitMessage,
} from "./types.ts";

declare let __export: unknown;
// eslint-disable-next-line prefer-const
__export = async (wasm_bindgen_module: WorkerInitArgs | Promise<WorkerInitArgs>) => {
    if (__DEBUG__) {
        console.log("dispatcher worker started");
    }
    const wasm_bindgen = await wasm_bindgen_module;
    const self_ = await getWorkerGlobalScope();
    self_.listen(async (e) => {
        const { recv, start_send, script, memory, wasm, useESWorker } = e as DispatcherInitMessage;
        const workerUrl = URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
        // initialize wasm with the same memory object to share memory
        wasm_bindgen.initSync({ memory, module: wasm });
        if (__DEBUG__) console.log("dispatcher worker wasm initialized");
        
        // safety: start_send is sent from create.ts which ultimately comes
        // from ThreadCreator::unready
        if (__DEBUG__) console.log(wasm_bindgen);
        await new Promise(r => setTimeout(r, 100));
        wasm_bindgen.__unsafe_pistonite_wbgspawn_send_signal(start_send);
        if (__DEBUG__) console.log("dispatcher worker signal sent");
        while (true) {
            // block on the mpsc channel to receive spawn requests
            if (__DEBUG__) console.log("dispatcher worker about to block");
            const p = wasm_bindgen.__pistonite_wbgspawn_dispatch_recv(recv);
            // the sender (ThreadCreator) is dropped, terminate the dispatcher
            if (!p) {
                break;
            }
            if (__DEBUG__) console.log("dispatcher worker got task: ", p);
            const [f, send, next_start_send, next_start_recv] = p;
            // spawn the web worker which is responsible for driving
            // the thread, wait for the worker context to start executing
            const worker = await createWorker(workerUrl, useESWorker);
            await new Promise<void>((resolve) => {
                worker.listen((data) => {
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
                });
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
        URL.revokeObjectURL(workerUrl);
        self_.postMessage(WORKER_MSG_SUCCESS);
    });
    if (__DEBUG__) {
        console.log("notifying dispatcher worker is ready");
    }
    self_.postMessage(WORKER_MSG_READY);
}

