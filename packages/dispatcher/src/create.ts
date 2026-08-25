import { WBG_TARGET_NO_MODULES, WBG_TARGET_WEB, type ThreadCreatorArgs } from "./binding.gen.ts";
import { createJsBlobUrl, createWorker } from "./shared.ts";
import type { DispatcherInitMessage } from "./types.ts";

// this is what's received from Rust, see create_dispatcher() in Rust
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
    if (import.meta.env.BUILD_DEBUG) {
        await __debug_init();
    }
    const [bg_target, bg_js, wasm_module, memory, recv, start_send] = ARGS;
    let useESWorker = false;
    let workerSource: string;
    let dispatcherSource: string;
    switch (bg_target) {
        case WBG_TARGET_NO_MODULES: {
            // no-modules target format is let wasm_bindgen = /* ... */;
            // we can inline directly into the worker scripts
            workerSource = `${bg_js}\n${WORKER_JS};_m(wasm_bindgen)`;
            dispatcherSource = `${bg_js}\n${DISPATCHER_JS};_m(wasm_bindgen)`;
            break;
        }
        case WBG_TARGET_WEB: {
            // web target format is ESM, we need to turn the raw source code
            // into a format that can be imported.
            let workerInitArgsExpr: string;
            if (
                // @ts-expect-error Window is not in libwebworker
                typeof Window === "function" ||
                typeof WorkerGlobalScope === "function"
            ) {
                // for browsers, we can use blob URL. Note we need to let the worker itself
                // create the blob url since it's not guaranteed that a worker can access
                // blob urls created by another worker
                const bgJsExpr = JSON.stringify(bg_js);
                workerInitArgsExpr = `(async()=>{
const bg=URL.createObjectURL(new Blob([${bgJsExpr}], {type:"text/javascript"}));
try{return await import(bg)}finally{URL.revokeObjectURL(bg)}
})()`;
            } else {
                // NodeJS does not allow import(<blob_url>) so we will use a data url
                // note this will not work if the bg_js has relative imports like import foo from "./foo.js";
                //
                // note: NodeJS/Deno works with both base64 and chatset=utf-8 data url,
                // Bun does not work with utf-8, only base64.
                //
                // [2026-08-24 you can remove this comment if it has aged]
                // Additionally Bun as of v1.3.14 cannot handle data urls that are too long.
                // That is fixed in Bun v1.4.0

                // @ts-expect-error Buffer global
                const encoded = Buffer.from(bg_js).toString("base64");
                const url = `data:text/javascript;base64,${encoded}`;
                workerInitArgsExpr = `(async()=>{return await import(${JSON.stringify(url)})})()`;
            }
            workerSource = `${WORKER_JS};_m(${workerInitArgsExpr})`;
            dispatcherSource = `${DISPATCHER_JS};_m(${workerInitArgsExpr})`;
            // must use ES worker for the `import` expression
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
    __debug("creating dispatcher worker");
    const dispatcher = await createWorker(dispatcherUrl, useESWorker);
    __debug("dispatcher worker created");
    await new Promise<void>((resolve) => {
        dispatcher.listen(async (data) => {
            if (data) {
                __debug("dispatcher worker ready");
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
            __debug("terminating dispatcher worker");
            dispatcher.terminate();
        });
    });
})();
