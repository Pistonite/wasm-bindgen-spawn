import dispatcherSource from "./dispatcher.ts?inline";
import workerSource from "./dispatcher.worker.ts?inline";

import type { ThreadStateType } from "./threadState";

export const dispatcherBuilder = async (
	wasmUrl: string,
	wbgUrl: string,
	memory: WebAssembly.Memory,
	receiverPtr: Receiver,
	startSendPtr: StartSend,
	startReceivePtr: StartReceive,
	dispatchPoll: (receiverPtr: StartReceive) => ThreadStateType
) => {
	// const wasmBindgen = await (await fetch(bindgenUrl)).text();
	// this one is dispatcher.ts - let's replace raw string inlining with build-time inlining from the actual script file
	// const dispatcherSrc = wasmBindgen + dispatcherSource;

	// const dispatcherUrl = URL.createObjectURL(
	// 	new Blob([dispatcherSrc], {type: "text/javascript"}),
	// );

	// This one is dispatcher.worker.ts - see above.
	const workerSrc = workerSource;

	const wasm = await (await fetch(wasmUrl)).arrayBuffer();

	const workerUrl = URL.createObjectURL(
		new Blob(
			[workerSrc],
			{type:"text/javascript"}
		)
	);

	const dispatcherUrl = URL.createObjectURL(
		new Blob(
			[dispatcherSource],
			{type:"text/javascript"}
		)
	);

	const dispatcher = new Worker(
		dispatcherUrl,
		{
			type:"module"
		}
	);

	await new Promise<void>((resolve) => {
		dispatcher.onmessage = ({data}) => {
			if (data) {
				resolve();
				// FXIME: Different keys! Look at the inlined js code above
				dispatcher.postMessage({
					wbgUrl,
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
