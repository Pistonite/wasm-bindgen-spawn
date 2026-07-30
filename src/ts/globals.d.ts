export {}

declare global {
	const __phantom: unique symbol;

	type Option<T> = T | null;

	type Pointer<T extends string> = number & {
		readonly [__phantom]: T;
	};

	type Receiver = Pointer<"receiver">;
	type StartSend = Pointer<"start_send">;
	type StartReceive = Pointer<"start_receive">;

	interface WasmBindgen {
		(config?: {
			memory?: WebAssembly.Memory;
			module_or_path?: ArrayBuffer | WebAssembly.Module;
		}): Promise<unknown>;

		__dispatch_start(ptr: StartSend): void;

		__dispatch_recv(
			ptr: NonNullable<Receiver>
		): Option<[
			id: number,
			closure: Function,
			senderPtr: Pointer<"sender_ptr">,
			startSendPtr: StartSend,
			startRecvPtr: StartReceive
		]>;

		__dispatch_poll_worker(ptr: StartReceive): boolean;

		__dispatch_drop(ptr: Receiver): void;

		__worker_main(
			f: NonNullable<Function>,
			start: StartSend
		): Pointer<"value_ptr">;

		__worker_send(
			id: number,
			send: number,
			value?: unknown
		): void;
	}

	const wasm_bindgen: WasmBindgen;
}
