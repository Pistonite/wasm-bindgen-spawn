// The worker code (spawned by the dispatcher)

import { getWorkerGlobalScope } from "./shared.ts";
import {
    WORKER_MSG_PANIC,
    WORKER_MSG_READY,
    WORKER_MSG_SUCCESS,
    type WorkerInitArgs,
    type WorkerInitMessage,
} from "./types.ts";

declare let __export: unknown;
// eslint-disable-next-line prefer-const
__export = async (wasm_bindgen_module: WorkerInitArgs | Promise<WorkerInitArgs>) => {
    await __debug("[worker-thread] started")
    const wasm_bindgen = await wasm_bindgen_module;
    const self_ = await getWorkerGlobalScope();
    self_.listen(async (e) => {
        await __debug("[worker-thread] received init payload")
        const { f, send, start, memory, wasm } = e as WorkerInitMessage;
        // initialize wasm with the same memory object to share memory
        wasm_bindgen.initSync({ memory, module: wasm });
        await __debug("[worker-thread] wasm initialized")
        try {
            // call the main function of the thread, handing the start
            // signal to Rust in the same call for convenience to signal
            // the dispatcher that it can block again.
            // on the happy path (no panic or panic=unwind and no hard abort),
            // the value will be sent to the join handle in the same call
            // so no additional JS-Rust call is needed
            await wasm_bindgen.__pistonite_wbgspawn_worker_main(f, send, start);
            await __debug("[worker-thread] posting success")
            self_.postMessage(WORKER_MSG_SUCCESS);
        } catch (e) {
            // panic in panic=abort or hard abort in panic=unwind
            console.error(e);
            // since the wasm instance is not safe to call in
            // this situation, we need to send the message to the
            // dispatcher to notify the join handle about the panic
            self_.postMessage(WORKER_MSG_PANIC);
            await __debug("[worker-thread] posting panic")
        }
    });
    await __debug("[worker-thread] posting ready")
    self_.postMessage(WORKER_MSG_READY);
}

