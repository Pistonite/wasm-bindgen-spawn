export type WBGLoaderResult = {
	init: Function;
	api: {
		__dispatch_start(ptr: StartSend): void;
		__dispatch_recv(ptr: NonNullable<Receiver>): Option<[id: number, closure: Function, senderPtr: Pointer<'sender_ptr'>, startSendPtr: StartSend, startRecvPtr: StartReceive]>;
		__dispatch_poll_worker(ptr: StartReceive): boolean;
		__dispatch_drop(ptr: Receiver): void;
		__worker_main(f: NonNullable<Function>, start: StartSend): Pointer<'value_ptr'>;
		__worker_send(id: number, send: number, value?: unknown): void;
	}
}

export async function loadWasmBindgen(wbgUrl: string): Promise<WBGLoaderResult> {
	const module = await import(/* webpackIgnore: true */ wbgUrl);

	return {
		init: module.default,
		api: module,
	};
}
