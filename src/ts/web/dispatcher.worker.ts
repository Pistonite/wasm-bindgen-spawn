import { ThreadState } from "../threadState";
import {loadWasmBindgen, type WBGLoaderResult} from "./wbg.loader";
import type {DispatcherWorkerPayload} from "./dispatcher";

let wasm_bindgen: Option<WBGLoaderResult> = null;

self.onmessage = async (event: MessageEvent<DispatcherWorkerPayload>) => {
	const {id, f, send, start, memory, wasm, wbgUrl} = event.data;

	let started = false;

	try {
		if (!wasm_bindgen) {
			wasm_bindgen = await loadWasmBindgen(wbgUrl);

			await wasm_bindgen.init({
				memory,
				module_or_path: wasm
			});
		}
	} catch (e) {
		self.console.error("worker initialization failed:", e);
		self.postMessage(ThreadState.Failed);
		return;
	}

	try {
		wasm_bindgen.api.__dispatch_start(start);
		started = true;

		const value = wasm_bindgen.api.__worker_main(f, start);

		wasm_bindgen.api.__worker_send(id, send, value);

		self.postMessage(ThreadState.Success);
	} catch (e) {
		self.console.error(e);

		self.postMessage(started ? ThreadState.Panic : ThreadState.Failed);
		return;
	} finally {
		self.close();
	}

};
self.postMessage(ThreadState.Ready);
