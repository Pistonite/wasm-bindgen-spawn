import dispatcherSource from "./dispatcher.ts?inline";
import workerSource from "./dispatcher.worker.ts?inline";
import {ThreadState, ThreadStateType} from "../threadState";

export const dispatcherBuilder = async (
	wasmUrl: string,
	wbgUrl: string,
	memory: WebAssembly.Memory,
	receiverPtr: Receiver,
	startSendPtr: StartSend,
	startReceivePtr: StartReceive,
) => {
	const wbgAbsUrl = new URL(wbgUrl, self.location.href).href;

	const wasm = await (await fetch(wasmUrl)).arrayBuffer();

	// let's replace raw string inlining with build-time inlining from the actual script file
	const workerUrl = URL.createObjectURL(
		new Blob(
			[workerSource],
			{type: "text/javascript"}
		)
	);

	const dispatcherUrl = URL.createObjectURL(
		new Blob(
			[dispatcherSource],
			{type: "text/javascript"}
		)
	);

	const dispatcher = new Worker(
		dispatcherUrl,
		{
			type: "module"
		}
	);

	let disposed = false;

	const dispose = () => {
		if (disposed) return;
		disposed = true;

		URL.revokeObjectURL(dispatcherUrl);
		URL.revokeObjectURL(workerUrl);
		dispatcher.terminate();
	};

	await new Promise<void>((resolve, reject) => {
		dispatcher.onmessage = ({data}: MessageEvent<ThreadStateType>) => {
			switch (data) {
				case ThreadState.Ready:
					dispatcher.postMessage({
						wbgUrl: wbgAbsUrl,
						receiverPtr,
						startSendPtr,
						startReceivePtr,
						url: workerUrl,
						memory,
						wasm,
					});
					return;

				case ThreadState.Success:
					dispose();
					return;

				case ThreadState.Initialized:
					resolve();
					return;

				case ThreadState.Panic:
					dispose();
					reject(new Error("Dispatcher panic"));
			}
		};

		dispatcher.onerror = (e) => {
			dispose();
			self.console.error(e);
			reject(new Error("Dispatcher failed to load"));
		};
	});
};
