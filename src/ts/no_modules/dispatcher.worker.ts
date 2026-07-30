import {ThreadState} from "../threadState";
import type {DispatcherWorkerPayload} from "./dispatcher";

self.onmessage = async (event: MessageEvent<DispatcherWorkerPayload>) => {
	const {id, f, send, start, memory, wasm} = event.data;

	let started = false;

	try {
		await wasm_bindgen({
			memory,
			module_or_path: wasm
		});

		// signal the dispatcher that the worker is now started, and is safe to block
		wasm_bindgen.__dispatch_start(start);
		started = true;

		const value = wasm_bindgen.__worker_main(f, start);
		wasm_bindgen.__worker_send(id, send, value);
	} catch (e) {
		self.console.error(e);
		self.postMessage(started ? ThreadState.Panic : ThreadState.Failed);
		return;
	}
	self.postMessage(ThreadState.Success);
};
self.postMessage(ThreadState.Ready);
