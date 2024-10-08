self.onmessage = async (e) => {
    const { recv, start_send, url, memory, wasm } = e.data;
    await wasm_bindgen({ memory, module_or_path: wasm });
    wasm_bindgen.__dispatch_start(start_send);
    while (true) {
        const p = wasm_bindgen.__dispatch_recv(recv);
        if (!p) {
            break;
        }
        const [id, f, send, start, next_start_recv] = p;
        await new Promise((resolve) => {
            const worker = new Worker(url);
            worker.onmessage = ({ data }) => {
                if (data) {
                    worker.postMessage({ id, f, send, start, memory, wasm });
                    return resolve();
                }
                worker.terminate();
            };
        });
        while (!wasm_bindgen.__dispatch_poll_worker(next_start_recv)) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    wasm_bindgen.__dispatch_drop(recv);
    self.postMessage(0);
};
self.postMessage(1);
