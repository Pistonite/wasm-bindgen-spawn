// The worker code (spawned by the dispatcher)

import {
    WORKER_MSG_PANIC,
    WORKER_MSG_READY,
    WORKER_MSG_SUCCESS,
    type WasmBindgen,
    type WorkerInitRequest,
} from "./types.ts";

declare const wasm_bindgen: WasmBindgen;
self.onmessage = async (e) => {
    const { f, send, start, memory, wasm } = e.data as WorkerInitRequest;
    await wasm_bindgen({ memory, module_or_path: wasm });
    try {
        const value = wasm_bindgen.__worker_main(f, start);
        wasm_bindgen.__worker_send(send, value);
    } catch (e) {
        self.console.error(e);
        // since the wasm instance is not safe to call in panic=abort after a panic,
        // send the message to the dispatcher to notify the join handle about the panic
        self.postMessage(WORKER_MSG_PANIC);
        return;
    }
    self.postMessage(WORKER_MSG_SUCCESS);
};
self.postMessage(WORKER_MSG_READY);
