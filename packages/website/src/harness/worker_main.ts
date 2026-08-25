import {
    type HarnessMessage,
    makeHarnessErrorMessage,
    makeHarnessMessage,
    type WorkerMessage,
} from "./message.ts";

const bc = new BroadcastChannel("wbgspawn-harness");
const postLog = (msg: HarnessMessage) => {
    bc.postMessage(JSON.stringify(msg));
};
if (!globalThis.crossOriginIsolated) {
    postLog(
        makeHarnessErrorMessage(
            "[Worker] Cross-origin isolation is NOT enabled. Either your browser does not support WASM threading or there is a bug in the website. The example will likely NOT work!!",
        ),
    );
}
self.onmessage = async (e) => {
    const message = e.data as WorkerMessage;
    if (message.type !== "run") {
        return;
    }
    const { example, panicRuntime } = message;
    postLog(makeHarnessMessage(`[Worker] Loading wasm module rt-${panicRuntime}`));
    // the automatic _bg.wasm resolution should work
    const scriptLocation = location.origin + `/rt-${panicRuntime}/rt_${panicRuntime}.js`;
    const script = await (await fetch(scriptLocation)).text();
    const wasm_bindgen = await import(/* @vite-ignore*/ scriptLocation);
    if (!(example in wasm_bindgen)) {
        postLog(makeHarnessErrorMessage(`[Worker] Cannot find '${example}'`));
        self.postMessage({ type: "done" } satisfies WorkerMessage);
        return;
    }

    await wasm_bindgen.default();
    await wasm_bindgen.init_thread_creator("web", script, undefined);

    postLog(makeHarnessMessage(`[Worker] Running '${example}' (panic=${panicRuntime})`));

    try {
        wasm_bindgen[example]();
        postLog(makeHarnessMessage(`[Worker] Done running '${example}' (panic=${panicRuntime})`));
    } catch (e) {
        postLog(
            makeHarnessMessage(`[Worker] Error running '${example}', please check the devtool`),
        );
        console.error(e);
    }

    self.postMessage({ type: "done" } satisfies WorkerMessage);
};
self.postMessage({ type: "ready" } satisfies WorkerMessage);
