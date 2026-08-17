import { measure, type WebWasmBundle } from "#framework";

self.onmessage = async (e) => {
    const data = e.data;
    const { testFilters, wasmBytes, bindgenScript } = data;
    const bindgenUrl = URL.createObjectURL(new Blob([bindgenScript], { type: "text/javascript" }));
    const wasm_bindgen: WebWasmBundle = await import(bindgenUrl);
    wasm_bindgen.initSync({ module: wasmBytes });
    const success = await wasm_bindgen.init_thread_creator(
        "fetch",
        "web",
        bindgenScript,
        wasmBytes,
    );
    if (!success) {
        self.postMessage("error: failed to init thread creator in WASM");
        return;
    }
    const examples = Object.keys(wasm_bindgen).filter((x) => x.startsWith("example_"));
    for (const testCase of examples) {
        const shouldRun =
            !testFilters.length || testFilters.some((x: string) => testCase.includes(x));
        if (!shouldRun) {
            continue;
        }
        measure(testCase, () => {
            const fn = wasm_bindgen[testCase as keyof typeof wasm_bindgen] as () => void;
            fn();
        });
    }
    // wait for any pending requests to flush
    await new Promise((r) => setTimeout(r, 5000));

    // untypical for browser to call uninit - so we will also skip it here
    self.postMessage("done");
};
self.postMessage("started");
