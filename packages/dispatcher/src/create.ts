import { WBG_TARGET_NO_MODULES, WBG_TARGET_WEB, type ThreadCreatorArgs } from "./binding.gen.ts";
import { createJsBlobUrl, createWorker } from "./shared.ts";
import type { DispatcherInitMessage } from "./types.ts";

// this is what's received from Rust, see ThreadCreator::unready
declare const ARGS: ThreadCreatorArgs;

// these are injected by build script, see vite.config.ts
// see dispatcher.ts for the dispatcher worker implementation
declare const DISPATCHER_JS: string;

// these are injected by build script, see vite.config.ts
// see worker.ts for the dispatcher worker implementation
declare const WORKER_JS: string;

declare let __return: Promise<void>;
// eslint-disable-next-line prefer-const
__return = (async () => {
    const [bg_target, bg_js, wasm_module, memory, recv, start_send] = ARGS;
    let useESWorker = false;
    let workerSource: string;
    let dispatcherSource: string;
    switch (bg_target) {
        case WBG_TARGET_NO_MODULES: {
            // no-modules target format is let wasm_bindgen = /* ... */;
            // we can inline directly into the worker scripts
            workerSource = `${bg_js}\n${WORKER_JS}_m(wasm_bindgen)`;
            dispatcherSource = `${bg_js}\n${DISPATCHER_JS}_m(wasm_bindgen)`;
            break;
        }
        case WBG_TARGET_WEB: {
            // web target format is ESM, we need to create a blob url
            // inside the worker (since not all implementation allow accessing
            // blob url created by another worker
            const bgJsExpr = JSON.stringify(bg_js);
            const workerInitArgsExpr = `
(async()=>{
const bg=URL.createObjectURL(new Blob([${bgJsExpr}], {type:"text/javascript"}));
try{return await import(bg)}finally{URL.revokeObjectURL(bg)}
})()`;
            workerSource = `${WORKER_JS}_m(${workerInitArgsExpr})`;
            dispatcherSource = `${DISPATCHER_JS}_m(${workerInitArgsExpr})`;
            // must use ES worker for the import expression
            useESWorker = true;
            break;
        }
        default: {
            throw new Error(
                "(Unexpected) Invalid bg_target passed to wasm-bindgen-spawn thread creator",
            );
        }
    }
    const dispatcherUrl = createJsBlobUrl(dispatcherSource);
    await __debug("creating dispatcher worker");
    const dispatcher = await createWorker(dispatcherUrl, useESWorker);
    await __debug("dispatcher worker created");
    await new Promise<void>((resolve) => {
        dispatcher.listen(async (data) => {
            if (data) {
                await __debug("dispatcher worker ready");
                // WORKER_MSG_READY, the dispatcher worker started
                // and we can send the message to initialize the dispatcher
                resolve();
                dispatcher.postMessage({
                    recv,
                    start_send,
                    script: workerSource,
                    memory,
                    wasm: wasm_module,
                    useESWorker,
                } satisfies DispatcherInitMessage);
                // now that the dispatcher is running, the code for the dispatcher
                // can be freed
                URL.revokeObjectURL(dispatcherUrl);
                return;
            }
            await __debug("terminating dispatcher worker");
            dispatcher.terminate();
        });
    });
})();
