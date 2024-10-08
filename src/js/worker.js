self.onmessage = async (e) => {
    const { id, f, send, start, memory, wasm } = e.data;
    await wasm_bindgen({ memory, module_or_path: wasm });
    try {
        const value = wasm_bindgen.__worker_main(f, start);
        wasm_bindgen.__worker_send(id, send, value);
    } catch (e) {
        self.console.error(e);
        wasm_bindgen.__worker_send(id, send);
    }
    self.postMessage(0);
};
self.postMessage(1);
