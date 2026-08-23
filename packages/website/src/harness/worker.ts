import type { WorkerMessage } from "./message.ts";
import { logHarnessMessage } from "./store.ts";
import type { PanicRuntime } from "./util.ts";

import ExampleWorker from "./worker_main.ts?worker";

/** Launch worker to load wasm module, initialize it, and run the example */
export const runExampleWorker = async (example: string, panicRuntime: PanicRuntime) => {
    logHarnessMessage("Starting wasm worker...");
    const worker = new ExampleWorker();
    const timeout = setTimeout(() => {
        logHarnessMessage("Worker timed out!");
        worker.terminate();
    }, 300000);
    worker.onmessage = (e) => {
        const msg = e.data as WorkerMessage;
        switch (msg.type) {
            case "ready": {
                worker.postMessage({
                    type: "run",
                    example,
                    panicRuntime: panicRuntime,
                } satisfies WorkerMessage);
                break;
            }
            case "done": {
                clearTimeout(timeout);
                worker.terminate();
                break;
            }
        }
    };
    worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
    };
};
