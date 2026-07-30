import workerSource from "./dispatcher.worker";
import dispatcherSource from "./dispatcher";

import {type Receiver, type StartReceive, type StartSend, ThreadState} from "./globals";

export const dispatcherBuilder = async (
	wasmUrl: string,
	bindgenUrl: string,
	memory: WebAssembly.Memory,
	receiverPtr: Receiver,
	startSendPtr: StartSend,
	startReceivePtr: StartReceive,
	dispatchPoll: (receiverPtr: StartReceive) => ThreadState
) => {
	const wasmBindgen = await (await fetch(bindgenUrl)).text();
	// this one is dispatcher.ts - let's replace raw string inlining with build-time inlining from the actual script file
	const dispatcherSrc = wasmBindgen + dispatcherSource;

	const dispatcherUrl = URL.createObjectURL(
		new Blob([dispatcherSrc], {type: "text/javascript"}),
	);

	// This one is dispatcher.worker.ts - see above.
	const workerSrc = wasmBindgen + workerSource;

	const workerUrl = URL.createObjectURL(
		new Blob([workerSrc], {type: "text/javascript"}),
	);

	const wasm = await (await fetch(wasmUrl)).arrayBuffer();

	const dispatcher = new Worker(dispatcherUrl);

	await new Promise<void>((resolve) => {
		dispatcher.onmessage = ({data}) => {
			if (data) {
				resolve();
				// FXIME: Different keys! Look at the inlined js code above
				dispatcher.postMessage({
					receiverPtr,
					startSendPtr,
					url: workerUrl,
					memory,
					wasm,
				});
				return;
			}
			URL.revokeObjectURL(dispatcherUrl);
			URL.revokeObjectURL(workerUrl);
			dispatcher.terminate();
		};
	});
	while (!dispatchPoll(startReceivePtr)) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
};
