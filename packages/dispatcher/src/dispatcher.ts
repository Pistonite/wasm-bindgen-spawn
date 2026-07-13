// The code for the dispatcher worker

import {
    type DispatcherInitRequest,
    WORKER_MSG_PANIC,
    WORKER_MSG_READY,
    WORKER_MSG_SUCCESS,
    type WorkerInitRequest,
    type WasmBindgen,
} from "./types.ts";
declare const wasm_bindgen: WasmBindgen;

self.onmessage = async (e) => {
    const { recv, start_send, url, memory, wasm } = e.data as DispatcherInitRequest;
    await wasm_bindgen({ memory, module_or_path: wasm });
    wasm_bindgen.__send_signal(start_send);
    while (true) {
        const p = wasm_bindgen.__dispatch_recv(recv);
        if (!p) {
            break;
        }
        const [f, send, start, next_start_recv] = p;
        await new Promise<void>((resolve) => {
            const worker = new Worker(url);
            worker.onmessage = ({ data }) => {
                switch (data) {
                    case WORKER_MSG_SUCCESS:
                        worker.terminate();
                        return;
                    case WORKER_MSG_READY:
                        worker.postMessage({
                            f,
                            send,
                            start,
                            memory,
                            wasm,
                        } satisfies WorkerInitRequest);
                        return resolve();
                    case WORKER_MSG_PANIC:
                        wasm_bindgen.__worker_send(send, undefined);
                        worker.terminate();
                        return;
                }
            };
        });
        while (!wasm_bindgen.__poll_signal(next_start_recv)) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    wasm_bindgen.__dispatch_drop(recv);
    self.postMessage(WORKER_MSG_SUCCESS);
};
self.postMessage(WORKER_MSG_PANIC);
