// The code for the dispatcher worker

import { WORKER_MSG_PANIC, WORKER_MSG_READY, WORKER_MSG_SUCCESS } from "./binding.gen.ts";
import { createJsBlobUrl, createWorker, getWorkerGlobalScope } from "./shared.ts";
import {
    type WorkerInitArgs,
    type DispatcherInitMessage,
    type WorkerInitMessage,
} from "./types.ts";

declare let __export: unknown;
// eslint-disable-next-line prefer-const
__export = async (wasm_bindgen_module: WorkerInitArgs | Promise<WorkerInitArgs>) => {
    if (import.meta.env.BUILD_DEBUG) {
        await __debug_init();
    }
    __debug("[disp-thread] started");
    let wasm_bindgen: WorkerInitArgs;
    try {
        wasm_bindgen = await wasm_bindgen_module;
    } catch (e) {
        console.error(e);
        throw e;
    }
    __debug("[disp-thread] module loaded");
    const self_ = await getWorkerGlobalScope();
    self_.listen(async (e) => {
        __debug("[disp-thread] received init payload");
        const { recv, start_send, script, memory, wasm, useESWorker } = e as DispatcherInitMessage;
        const workerUrl = createJsBlobUrl(script);
        // initialize wasm with the same memory object to share memory
        wasm_bindgen.initSync({ memory, module: wasm });
        __debug("[disp-thread] wasm initialized");

        // safety: start_send is sent from create.ts which ultimately comes
        // from ThreadCreator::unready
        wasm_bindgen.__unsafe_pistonite_wbgspawn_send_signal(start_send);
        __debug("[disp-thread] start signal sent");
        while (true) {
            // waiting on the mpsc channel to receive spawn requests
            // this now uses tokio::sync::mpsc which is an async channel
            // and thankfully runtime agnostic; this means the dispatcher
            // is able to do other stuff while waiting to spawn new threads.
            __debug("[disp-thread] parking on recv");
            const p = await wasm_bindgen.__pistonite_wbgspawn_dispatch_recv(recv);
            // the sender is dropped, terminate the dispatcher
            if (!p) {
                break;
            }
            __debug("[disp-thread] task received");
            const [f, send, next_start_send, next_start_recv] = p;
            // spawn the web worker which is responsible for driving
            // the thread, wait for the worker context to start executing
            const worker = await createWorker(workerUrl, useESWorker);
            await new Promise<void>((resolve) => {
                let panicPosted = false;
                worker.listen(async (data) => {
                    switch (data) {
                        case WORKER_MSG_READY:
                            __debug("[disp-thread] worker ready received");
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
                            __debug("[disp-thread] worker success received, terminating worker");
                            worker.terminate();
                            return;
                        case WORKER_MSG_PANIC:
                            __debug("[disp-thread] worker panic received, terminating worker");
                            if (!panicPosted) {
                                // upon hard abort, the wasm instance in the worker
                                // cannot be safely called again, so we let the dispatcher
                                // send the result.
                                panicPosted = true;
                                wasm_bindgen.__unsafe_pistonite_wbgspawn_send_panic(send);
                            }
                            worker.terminate();
                            return;
                        default:
                            worker.terminate();
                    }
                });
            });
            // TODO - this might not be necessary anymore since receiving
            // does not block the worker
            //
            // similar to the comment in create.ts, if we block the dispatcher
            // immediately for receiving the next spawn request, the postMessage
            // could never fire and thus never spawn the thread onto the worker,
            // so we poll for a signal from the worker that the postMessage
            // was received, and then start blocking on the next iteration of the while(true)
            // loop
            //
            // safety: next_start_send/recv is created in _dispatch_recv where into_js is called
            while (
                wasm_bindgen.__unsafe_pistonite_wbgspawn_poll_signal(next_start_recv) === false
            ) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }
        __debug("[disp-thread] dropping receiver");
        // clean up the dispatcher
        wasm_bindgen.__pistonite_wbgspawn_dispatch_drop(recv);
        URL.revokeObjectURL(workerUrl);
        __debug("[disp-thread] posting done");
        self_.postMessage(WORKER_MSG_SUCCESS);
    });
    __debug("[disp-thread] posting ready");
    self_.postMessage(WORKER_MSG_READY);
};
