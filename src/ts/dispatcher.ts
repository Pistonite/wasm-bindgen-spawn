import {Receiver, StartSend, ThreadState} from "./globals";

type DispatcherPayload = {
	receiverPtr: Receiver,
	startSendPtr: StartSend,
	url: string,
	memory: WebAssembly.Memory,
	wasm: ArrayBuffer,
}

self.onmessage = async (event: MessageEvent<DispatcherPayload>) => {
	const {receiverPtr, startSendPtr, url, memory, wasm} = event.data;

	await wasm_bindgen({memory, module_or_path: wasm});
	wasm_bindgen.__dispatch_start(startSendPtr);

	while (true) {
		const p = wasm_bindgen.__dispatch_recv(receiverPtr);
		if (!p) {
			break;
		}
		const [id, f, send, start, nextStartRecv] = p;
		await new Promise<void>((resolve) => {
			const worker = new Worker(url);
			worker.onmessage = ({data}: MessageEvent<ThreadState>) => {
				switch (data) {
					case ThreadState.Success:
						worker.terminate();
						return;
					case ThreadState.Ready:
						worker.postMessage({id, f, send, start, memory, wasm});
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
