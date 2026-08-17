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
    await __debug("[disp-thread] started");
    let wasm_bindgen: WorkerInitArgs;
    try {
        wasm_bindgen = await wasm_bindgen_module;
    } catch (e) {
        console.error(e);
        throw e;
    }
    await __debug("[disp-thread] module loaded");
    const self_ = await getWorkerGlobalScope();
    self_.listen(async (e) => {
        await __debug("[disp-thread] received init payload");
        const { recv, start_send, script, memory, wasm, useESWorker } = e as DispatcherInitMessage;
        const workerUrl = createJsBlobUrl(script);
        // initialize wasm with the same memory object to share memory
        wasm_bindgen.initSync({ memory, module: wasm });
        await __debug("[disp-thread] wasm initialized");

        // safety: start_send is sent from create.ts which ultimately comes
        // from ThreadCreator::unready
        wasm_bindgen.__unsafe_pistonite_wbgspawn_send_signal(start_send);
        await __debug("[disp-thread] start signal sent");
        while (true) {
            // block on the mpsc channel to receive spawn requests
            await __debug("[disp-thread] blocking on recv");
            const p = wasm_bindgen.__pistonite_wbgspawn_dispatch_recv(recv);
            // the sender (ThreadCreator) is dropped, terminate the dispatcher
            if (!p) {
                break;
            }
            await __debug("[disp-thread] task received");
            const [f, send, next_start_send, next_start_recv] = p;
            // spawn the web worker which is responsible for driving
            // the thread, wait for the worker context to start executing
            const worker = await createWorker(workerUrl, useESWorker);
            await new Promise<void>((resolve) => {
                worker.listen(async (data) => {
                    switch (data) {
                        case WORKER_MSG_READY:
                            await __debug("[disp-thread] worker ready received");
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
                            await __debug(
                                "[disp-thread] worker success received, terminating worker",
                            );
                            worker.terminate();
                            return;
                        case WORKER_MSG_PANIC:
                            await __debug(
                                "[disp-thread] worker panic received, terminating worker",
                            );
                            worker.terminate();
                            return;
                        default:
                            worker.terminate();
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
            while (
                wasm_bindgen.__unsafe_pistonite_wbgspawn_poll_signal(next_start_recv) === false
            ) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }
        await __debug("[disp-thread] dropping receiver");
        // clean up the dispatcher
        wasm_bindgen.__pistonite_wbgspawn_dispatch_drop(recv);
        URL.revokeObjectURL(workerUrl);
        await __debug("[disp-thread] posting done");
        self_.postMessage(WORKER_MSG_SUCCESS);
    });
    await __debug("[disp-thread] posting ready");
    self_.postMessage(WORKER_MSG_READY);
};
