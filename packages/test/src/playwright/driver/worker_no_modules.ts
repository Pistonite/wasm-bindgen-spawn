// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const wasm_bindgen: any;
self.onmessage = async (e) => {
    const data = e.data;
    const { wasmBytes, bindgenScript } = data;
    wasm_bindgen.initSync({ module: wasmBytes });
    const success = await wasm_bindgen.init_thread_creator("fetch", "no-modules", bindgenScript, undefined);
    if (!success) {
        self.postMessage("error: failed to init thread creator in WASM");
        return;
    }
    wasm_bindgen.example_join_handle();
    wasm_bindgen.example_mpsc_channel();
    // wait for any pending requests to flush
    await new Promise(r=>setTimeout(r, 5000));
    self.postMessage("done");
}
self.postMessage("started");
