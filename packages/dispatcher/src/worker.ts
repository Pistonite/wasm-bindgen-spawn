// The worker code (spawned by the dispatcher)

import type { WasmBindgen } from "./binding.gen.ts";
import {
    WORKER_MSG_PANIC,
    WORKER_MSG_READY,
    WORKER_MSG_SUCCESS,
    type WorkerInitMessage,
} from "./types.ts";

declare const wasm_bindgen: WasmBindgen;
self.onmessage = async (e) => {
    const { f, send, start, memory, wasm } = e.data as WorkerInitMessage;
    // initialize wasm with the same memory object to share memory
    await wasm_bindgen({ memory, module_or_path: wasm });
    try {
        // call the main function of the thread, handing the start
        // signal to Rust in the same call for convenience to signal
        // the dispatcher that it can block again.
        // on the happy path (no panic or panic=unwind and no hard abort),
        // the value will be sent to the join handle in the same call
        // so no additional JS-Rust call is needed
        wasm_bindgen.__pistonite_wbgspawn_worker_main(f, send, start);
    } catch (e) {
        // panic in panic=abort or hard abort in panic=unwind
        self.console.error(e);
        // since the wasm instance is not safe to call in
        // this situation, we need to send the message to the
        // dispatcher to notify the join handle about the panic
        self.postMessage(WORKER_MSG_PANIC);
        return;
    }
    self.postMessage(WORKER_MSG_SUCCESS);
};
self.postMessage(WORKER_MSG_READY);
