// The worker code (spawned by the dispatcher)

import { WORKER_MSG_PANIC, WORKER_MSG_READY, WORKER_MSG_SUCCESS } from "./binding.gen.ts";
import { getWorkerGlobalScope } from "./shared.ts";
import { type WorkerInitArgs, type WorkerInitMessage } from "./types.ts";

declare let __export: unknown;
// eslint-disable-next-line prefer-const
__export = async (wasm_bindgen_module: WorkerInitArgs | Promise<WorkerInitArgs>) => {
    await __debug_init();
    __debug("[worker-thread] started");
    let wasm_bindgen: WorkerInitArgs;
    try {
        wasm_bindgen = await wasm_bindgen_module;
    } catch (e) {
        console.error(e);
        throw e;
    }
    __debug("[worker-thread] module loaded");
    const self_ = await getWorkerGlobalScope();
    self_.listen(async (e) => {
        __debug("[worker-thread] received init payload");
        const { f, send, start, memory, wasm } = e as WorkerInitMessage;
        // initialize wasm with the same memory object to share memory
        wasm_bindgen.initSync({ memory, module: wasm });
        __debug("[worker-thread] wasm initialized");
        try {
            let abortCalled = false;
            // create a global binding for Rust side to terminate on hard abort
            // without having to touch Rust code again - Since hard aborts
            // surface as JS exceptions, we essentially want:
            //
            // try { doSomethingInRust() } catch { /* hard abort */ __global_abort() }
            //
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).__pistonite_wbgspawn_worker_terminate = (abort: boolean) => {
                __debug("[worker-thread] global abort called");
                if (abort) {
                    abortCalled = true;
                    self_.postMessage(WORKER_MSG_PANIC);
                } else {
                    // "soft" panic: caught with unwind
                    self_.postMessage(WORKER_MSG_SUCCESS);
                }
                self_.terminate();
            };
            // call the main function of the thread, handing the start
            // signal to Rust in the same call for convenience to signal
            // the dispatcher that it can block again.
            // on the happy path (no panic or panic=unwind and no hard abort),
            // the value will be sent to the join handle in the same call
            // so no additional JS-Rust call is needed
            await wasm_bindgen.__pistonite_wbgspawn_worker_main(f, send, start);

            if (!abortCalled) {
                // the value is already sent to the join handle,
                // notify the dispatcher to terminate us
                __debug("[worker-thread] posting success");
                self_.postMessage(WORKER_MSG_SUCCESS);
            }
        } catch {
            // exceptions caught here are synchronous panics
            self_.postMessage(WORKER_MSG_PANIC);
            __debug("[worker-thread] posting panic");
        }

        // if the dispatcher does not terminate us after some time, we terminate ourselves
        await new Promise((r) => setTimeout(r, 1000));
        self_.terminate();
    });

    __debug("[worker-thread] posting ready");
    self_.postMessage(WORKER_MSG_READY);
};
