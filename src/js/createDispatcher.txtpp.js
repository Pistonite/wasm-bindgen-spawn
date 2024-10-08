return (async function () {
    const wbg = await (await fetch(args[1])).text();
    const DISPATCHER =
        wbg +
        `
TXTPP#include dispatcher.min.js
`;
    const dispatcherUrl = URL.createObjectURL(
        new Blob([DISPATCHER], { type: "text/javascript" }),
    );
    const WORKER =
        wbg +
        `
TXTPP#include worker.min.js
`;
    const workerUrl = URL.createObjectURL(
        new Blob([WORKER], { type: "text/javascript" }),
    );
    const wasm = await (await fetch(args[0])).arrayBuffer();
    const memory = args[2];
    const recv = args[3];
    const start_send = args[4];
    const start_recv = args[5];
    const __dispatch_poll_worker = args[6];
    const dispatcher = new Worker(dispatcherUrl);
    await new Promise((resolve) => {
        dispatcher.onmessage = ({ data }) => {
            if (data) {
                resolve();
                dispatcher.postMessage({
                    recv,
                    start_send,
                    url: workerUrl,
                    memory,
                    wasm,
                });
                return;
            }
            URL.revokeObjectURL(dispatcherUrl);
            URL.revokeObjectURL(workerUrl);
            dispatcher.terminate();
        };
    });
    while (!__dispatch_poll_worker(start_recv)) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
})();
