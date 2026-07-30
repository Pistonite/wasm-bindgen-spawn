import { ThreadState, type ThreadStateType } from "./threadState";

type DispatcherPayload = {
	wbgUrl: string;
	receiverPtr: Receiver,
	startSendPtr: StartSend,
	url: string,
	memory: WebAssembly.Memory,
	wasm: ArrayBuffer,
}

let wasm_bindgen: any;

self.onmessage = async (event: MessageEvent<DispatcherPayload>) => {
	const {wbgUrl, receiverPtr, startSendPtr, url, memory, wasm,} = event.data;

	if (!wasm_bindgen) {
		wasm_bindgen = (
			await import(/* webpackIgnore: true */ wbgUrl)
		).default;
	}

	await wasm_bindgen({memory, module_or_path: wasm});
	wasm_bindgen.__dispatch_start(startSendPtr);

	while (true) {
		const p = wasm_bindgen.__dispatch_recv(receiverPtr);
		if (!p) {
			break;
		}
		const [id, f, send, start, nextStartRecv] = p;
		await new Promise<void>((resolve) => {
			const worker = new Worker(url, {
				type: "module"
			});

			worker.onmessage = ({data}: MessageEvent<ThreadStateType>) => {
				switch (data) {
					case ThreadState.Success:
						worker.terminate();
						return;
					case ThreadState.Ready:
						worker.postMessage({id, f, send, start, memory, wasm, wbgUrl});
						return resolve();
					case ThreadState.Panic:
						wasm_bindgen.__worker_send(id, send);
						worker.terminate();
						return;
				}
			};
		});
		while (!wasm_bindgen.__dispatch_poll_worker(nextStartRecv)) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}
	wasm_bindgen.__dispatch_drop(receiverPtr);
	self.postMessage(ThreadState.Success);
};
self.postMessage(ThreadState.Ready);
