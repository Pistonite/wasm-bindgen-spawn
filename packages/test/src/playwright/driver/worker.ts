import {
    getTestSelection,
    measure,
    type NoModulesWasmBundle,
    type WebWasmBundle,
} from "#framework";

// injected when target=no-modules
declare const wasm_bindgen: NoModulesWasmBundle;

self.onmessage = async (e) => {
    const data = e.data;
    const { logOutputEndpoint, target, testFilters, wasmBytes, bindgenScript } = data;
    let wasmBundle: NoModulesWasmBundle | WebWasmBundle;
    if (target === "no-modules") {
        wasmBundle = wasm_bindgen;
    } else {
        const bindgenUrl = URL.createObjectURL(
            new Blob([bindgenScript], { type: "text/javascript" }),
        );
        wasmBundle = (await import(bindgenUrl)) as WebWasmBundle;
        URL.revokeObjectURL(bindgenUrl);
    }

    // initialize the wasm instance
    wasmBundle.initSync({ module: wasmBytes });
    const success = await wasmBundle.init_thread_creator(
        target === "no-modules" ? "no-modules" : "web",
        bindgenScript,
        // bundler targets needs to pass in the wasmBytes since
        // wasm_bindgen::module() is not available
        target === "vite" ? wasmBytes : undefined,
    );
    if (!success) {
        self.postMessage("error: failed to init thread creator in WASM");
        return;
    }
    const examples = Object.keys(wasmBundle).filter((x) => x.startsWith("example_"));
    for (const testCase of getTestSelection(examples, testFilters)) {
        measure(testCase, () => {
            const fn = wasmBundle[testCase as keyof WebWasmBundle] as () => void;
            fn();
        });
    }
    // wait for any pending requests to flush
    await new Promise((r) => setTimeout(r, 5000));

    // send the logs
    const logs = wasmBundle.get_log();
    await fetch(logOutputEndpoint, { method: "POST", body: logs });

    // untypical for browser to call uninit - so we will also skip it here
    self.postMessage("done");
};
self.postMessage("started");
