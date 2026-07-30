import { ThreadState } from "./threadState";

let wasm_bindgen: any;

self.onmessage = async (event: MessageEvent<any>) => {
	const {id, f, send, start, memory, wasm, wbgUrl} = event.data;

	if (!wasm_bindgen) {
		wasm_bindgen = (
			await import(/* webpackIgnore: true */ wbgUrl)
		).default;
	}

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
