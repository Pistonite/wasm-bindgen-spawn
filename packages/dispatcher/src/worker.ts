// The worker code (spawned by the dispatcher)

import { WORKER_MSG_PANIC, WORKER_MSG_READY, WORKER_MSG_SUCCESS } from "./binding.gen.ts";
import { getWorkerGlobalScope } from "./shared.ts";
import { type WorkerInitArgs, type WorkerInitMessage } from "./types.ts";

declare let __export: unknown;
// eslint-disable-next-line prefer-const
__export = async (wasm_bindgen_module: WorkerInitArgs | Promise<WorkerInitArgs>) => {
    await __debug("[worker-thread] started");
    let wasm_bindgen: WorkerInitArgs;
    try {
        wasm_bindgen = await wasm_bindgen_module;
    } catch(e) {
        console.error(e);
        throw e;
    }
    await __debug("[worker-thread] module loaded");
    const self_ = await getWorkerGlobalScope();
    self_.listen(async (e) => {
        await __debug("[worker-thread] received init payload");
        const { f, send, start, memory, wasm } = e as WorkerInitMessage;
        // initialize wasm with the same memory object to share memory
        wasm_bindgen.initSync({ memory, module: wasm });
        await __debug("[worker-thread] wasm initialized");
        try {
            // call the main function of the thread, handing the start
            // signal to Rust in the same call for convenience to signal
            // the dispatcher that it can block again.
            // on the happy path (no panic or panic=unwind and no hard abort),
            // the value will be sent to the join handle in the same call
            // so no additional JS-Rust call is needed
            await wasm_bindgen.__pistonite_wbgspawn_worker_main(
                f,
                send,
                start,
                async (msg: number) => {
                    await __debug("[worker-thread] termination fn called: " + msg);
                    self_.postMessage(
                        msg === WORKER_MSG_SUCCESS ? WORKER_MSG_SUCCESS : WORKER_MSG_PANIC,
                    );
                    self_.terminate();
                },
            );

            // we should have already terminated, but if we reached here,
            // we will notify the dispatcher to terminate us
            await __debug("[worker-thread] posting success");
            self_.postMessage(WORKER_MSG_SUCCESS);
        } catch (e) {
            // exceptions should be caught by the thread's runtime,
            // if we reach here, the join handle might not get the message yet
            console.error(e);
            self_.postMessage(WORKER_MSG_PANIC);
            await __debug("[worker-thread] posting panic, the join handle might hang");
        }

        // if the dispatcher does not terminate us after some time, we terminate ourselves
        await new Promise((r) => setTimeout(r, 1000));
        self_.terminate();
    });

    await __debug("[worker-thread] posting ready");
    self_.postMessage(WORKER_MSG_READY);
};
