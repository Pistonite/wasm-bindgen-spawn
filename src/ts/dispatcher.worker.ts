import {ThreadState} from "./globals";

self.onmessage = async (event: MessageEvent<?>) => {
	const {id, f, send, start, memory, wasm} = event.data;
	await wasm_bindgen({memory, module_or_path: wasm});
	try {
		const value = wasm_bindgen.__worker_main(f, start);
		wasm_bindgen.__worker_send(id, send, value);
	} catch (e) {
		self.console.error(e);
		self.postMessage(ThreadState.Panic);
		return;
	}
	self.postMessage(ThreadState.Success);
};
self.postMessage(ThreadState.Ready);
