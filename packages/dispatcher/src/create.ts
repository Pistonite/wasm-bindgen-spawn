import type { ThreadCreatorArgs } from "./binding.gen.ts";
import type { DispatcherInitMessage } from "./types.ts";
// this is what's received from Rust, see ThreadCreator::unready
declare const ARGS: ThreadCreatorArgs;
// these are injected by build script, see vite.config.ts
declare const DISPATCHER_JS: string;
// these are injected by build script, see vite.config.ts
declare const WORKER_JS: string;
// this is to emulate top level return; i.e. this file
// is passed to the function contructor
declare let RETURN: Promise<void>;
// eslint-disable-next-line
RETURN = (async function () {
    const wbg = await (await fetch(ARGS[1])).text();
    const DISPATCHER = wbg + DISPATCHER_JS;
    const dispatcherUrl = URL.createObjectURL(new Blob([DISPATCHER], { type: "text/javascript" }));
    const WORKER = wbg + WORKER_JS;
    const workerUrl = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
    const wasm = await (await fetch(ARGS[0])).arrayBuffer();
    const memory = ARGS[2];
    const recv = ARGS[3];
    const start_send = ARGS[4];
    const start_recv = ARGS[5];
    const poll_signal_fn = ARGS[6];
    const dispatcher = new Worker(dispatcherUrl);
    // see dispatcher.ts for the dispatcher worker implementation
    await new Promise<void>((resolve) => {
        dispatcher.onmessage = ({ data }) => {
            if (data) {
                // WORKER_MSG_READY, the dispatcher worker started
                // and we can send the message to initialize the dispatcher
                resolve();
                dispatcher.postMessage({
                    recv,
                    start_send,
                    url: workerUrl,
                    memory,
                    wasm,
                } satisfies DispatcherInitMessage);
                return;
            }
            // WORKER_MSG_SUCCESS, the ThreadCreator is dropped
            // and no more threads can be created, terminate the dispatcher
            // and clean up
            URL.revokeObjectURL(dispatcherUrl);
            URL.revokeObjectURL(workerUrl);
            dispatcher.terminate();
        };
    });
    // we need to poll the signal to ensure the postMessage
    // has fired and the dispatcher is now blocked on waiting for spawn requests.
    // Otherwise, this context can be blocked by caller and dispatcher never
    // receives the initialize message
    while (!poll_signal_fn(start_recv)) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
})();
