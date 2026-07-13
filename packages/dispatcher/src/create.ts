import type { DispatcherInitRequest, ThreadCreatorArgs } from "./types.ts";
declare const ARGS: ThreadCreatorArgs;
declare const DISPATCHER_JS: string;
declare const WORKER_JS: string;
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
    const __poll_signal = ARGS[6];
    const dispatcher = new Worker(dispatcherUrl);
    await new Promise<void>((resolve) => {
        dispatcher.onmessage = ({ data }) => {
            if (data) {
                resolve();
                dispatcher.postMessage({
                    recv,
                    start_send,
                    url: workerUrl,
                    memory,
                    wasm,
                } satisfies DispatcherInitRequest);
                return;
            }
            URL.revokeObjectURL(dispatcherUrl);
            URL.revokeObjectURL(workerUrl);
            dispatcher.terminate();
        };
    });
    while (!__poll_signal(start_recv)) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
})();
