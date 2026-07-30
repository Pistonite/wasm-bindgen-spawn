import {ThreadState, type ThreadStateType} from "../threadState";
import {loadWasmBindgen, WBGLoaderResult} from "./wbg.loader";

type DispatcherPayload = {
	startReceivePtr: StartReceive;
	wbgUrl: string;
	receiverPtr: Receiver,
	startSendPtr: StartSend,
	url: string,
	memory: WebAssembly.Memory,
	wasm: ArrayBuffer,
}

let wasm_bindgen: Option<WBGLoaderResult> = null;


type DispatchRecvReturn = NonNullable<ReturnType<WBGLoaderResult['api']['__dispatch_recv']>>;

export type DispatcherWorkerPayload = {
	id: DispatchRecvReturn[0],
	f: DispatchRecvReturn[1], // closure
	send: DispatchRecvReturn[2],
	start: DispatchRecvReturn[3],
	memory: DispatcherPayload['memory'],
	wasm: DispatcherPayload['wasm'],
	wbgUrl: string,
};


// Not sure what value for timeout to use
const DISPATCH_START_TIMEOUT_MS = 30_000;

self.onmessage = async (event: MessageEvent<DispatcherPayload>) => {
	const {wbgUrl, receiverPtr, startReceivePtr, startSendPtr, url, memory, wasm,} = event.data;

	try {
		if (!wasm_bindgen) {
			wasm_bindgen = await loadWasmBindgen(wbgUrl);

			await wasm_bindgen.init({
				memory,
				module_or_path: wasm,
			});
		}

		wasm_bindgen.api.__dispatch_start(startSendPtr);

		while (!wasm_bindgen.api.__dispatch_poll_worker(startReceivePtr)) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		self.postMessage(ThreadState.Initialized);

		while (true) {
			const p = wasm_bindgen.api.__dispatch_recv(receiverPtr);

			if (!p) {
				break;
			}

			const [id, f, send, start, nextStartRecv] = p;

			let startOrphaned = false;

			await new Promise<void>((resolve) => {
				const worker = new Worker(url, {
					type: "module",
				});

				const fail = (orphaned = false) => {
					startOrphaned = orphaned;
					wasm_bindgen!.api.__worker_send(id, send); // join() will receive Panic
					worker.terminate();
					resolve();
				};

				worker.onerror = (e) => {
					self.console.error(e);
					fail(true);
				};

				worker.onmessage = ({data}: MessageEvent<ThreadStateType>) => {
					switch (data) {
						case ThreadState.Failed:
							fail(true);
							return;

						case ThreadState.Success:
						case ThreadState.Panic:
							worker.terminate();
							return;

						case ThreadState.Ready:
							worker.postMessage({
								id,
								f,
								send,
								start,
								memory,
								wasm,
								wbgUrl,
							} satisfies DispatcherWorkerPayload);
							resolve();
							return;
					}
				};
			});

			const deadline = Date.now() + DISPATCH_START_TIMEOUT_MS;

			while (!wasm_bindgen.api.__dispatch_poll_worker(nextStartRecv)) {
				if (startOrphaned) {
					startOrphaned = false;
					wasm_bindgen.api.__dispatch_start(start);
					continue;
				}

				if (Date.now() > deadline) {
					self.console.error("wasm-bindgen-spawn: worker start signal timed out");
					break;
				}

				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		wasm_bindgen.api.__dispatch_drop(receiverPtr);

		self.postMessage(ThreadState.Success);
	} catch (e) {
		console.error(e);
		self.postMessage(ThreadState.Panic);
	}
};
self.postMessage(ThreadState.Ready);