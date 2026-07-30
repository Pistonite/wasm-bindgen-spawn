import {ThreadState, type ThreadStateType} from "../threadState";

type DispatcherPayload = {
	startReceivePtr: StartReceive;
	receiverPtr: Receiver,
	startSendPtr: StartSend,
	url: string, // workerUrl
	memory: WebAssembly.Memory,
	wasm: ArrayBuffer,
}

type DispatchRecvReturn = NonNullable<ReturnType<typeof wasm_bindgen.__dispatch_recv>>;

export type DispatcherWorkerPayload = {
	id: DispatchRecvReturn[0],
	f: DispatchRecvReturn[1], // closure
	send: DispatchRecvReturn[2],
	start: DispatchRecvReturn[3],
	memory: DispatcherPayload['memory'],
	wasm: DispatcherPayload['wasm'],
};

// Not sure what value for timeout to use
const DISPATCH_START_TIMEOUT_MS = 30_000;

self.onmessage = async (event: MessageEvent<DispatcherPayload>) => {
	try {
		const {receiverPtr, startReceivePtr, startSendPtr, url, memory, wasm,} = event.data;

		await wasm_bindgen({memory, module_or_path: wasm});

		wasm_bindgen.__dispatch_start(startSendPtr);

		while (!wasm_bindgen.__dispatch_poll_worker(startReceivePtr)) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		self.postMessage(ThreadState.Initialized);

		while (true) {
			const p = wasm_bindgen.__dispatch_recv(receiverPtr);

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
					wasm_bindgen.__worker_send(id, send); // join() will receive Panic
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
							} satisfies DispatcherWorkerPayload);
							resolve();
							return;

						case ThreadState.Panic:
							fail();
							return;
					}
				};
			});

			const deadline = Date.now() + DISPATCH_START_TIMEOUT_MS;

			while (!wasm_bindgen.__dispatch_poll_worker(nextStartRecv)) {
				if (startOrphaned) {
					startOrphaned = false;
					wasm_bindgen.__dispatch_start(start);
					continue;
				}

				if (Date.now() > deadline) {
					self.console.error("wasm-bindgen-spawn: worker start signal timed out");
					break;
				}

				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		wasm_bindgen.__dispatch_drop(receiverPtr);

		self.postMessage(ThreadState.Success);
	} catch (e) {
		console.error(e);
		self.postMessage(ThreadState.Panic);
	}
};
self.postMessage(ThreadState.Ready);
