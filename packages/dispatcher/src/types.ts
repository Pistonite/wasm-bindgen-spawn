// opaque pointer types from rust

declare const RustType: unique symbol;
export type NonNull<T> = number & { readonly [RustType]: T };

/** wasm_bindgen interface */
export interface WasmBindgen {
    (init: { memory: WebAssembly.Memory; module_or_path: WebAssembly.Module }): Promise<void>;
    /** Call the closure f in the current worker, send the start signal before that. */
    __worker_main(
        moves_f: NonNull<"BoxClosure">,
        moves_start: NonNull<"SignalSender">,
    ): NonNull<"WorkerResult">;
    /** Send the returned value of the closure executed in the worker */
    __worker_send(
        moves_send: NonNull<"ValueSender">,
        moves_value: NonNull<"WorkerResult"> | undefined,
    ): void;

    /** Send a signal */
    __send_signal(moves_signal: NonNull<"SignalSender">): void;
    /**
     * Return true if the signal is received. If returns true, also moves (drops) the receiver
     */
    __poll_signal(maybe_move_signal: NonNull<"SignalReceiver">): boolean;

    /**
     * Receive a request to spawn a thread with the dispatcher. Blocks until a request is received.
     */
    __dispatch_recv(borrows_recv: NonNull<"DispatchReceiver">): DispatchThreadRequest | undefined;

    /** Drops the receiver */
    __dispatch_drop(moves_recv: NonNull<"DispatchReceiver">): void;
}

export type DispatchThreadRequest = [
    NonNull<"BoxClosure"> /* main_function */,
    NonNull<"ValueSender"> /* result_sender */,
    NonNull<"SignalSender"> /* start_send */,
    NonNull<"SignalReceiver"> /* start_recv */,
];

export type ThreadCreatorArgs = [
    string /* module_bg.wasm url */,
    string /* module_bg.js url */,
    WebAssembly.Memory,
    NonNull<"DispatchReceiver"> /* receiver for thread-spawn requests */,
    NonNull<"SignalSender"> /* start signal for the dispatcher */,
    NonNull<"SignalReceiver"> /* start signal for the dispatcher */,
    WasmBindgen["__poll_signal"] /* the __poll_signal function of the current wasm_bindgen instance */,
];

// js types
export interface WorkerInitRequest {
    /** main rust closure to execute */
    f: NonNull<"BoxClosure">;
    /** sender for the return value */
    send: NonNull<"ValueSender">;
    /** sender for the start signal */
    start: NonNull<"SignalSender">;
    /** memory for instantiating the wasm instance in this thread (worker) */
    memory: WebAssembly.Memory;
    /** compiled module for instantiating the wasm instance in this thread (worker) */
    wasm: WebAssembly.Module;
}

export interface DispatcherInitRequest {
    /** receiver for thread-spawn requests */
    recv: NonNull<"DispatchReceiver">;
    /** signal to indicate the dispatcher is ready */
    start_send: NonNull<"SignalSender">;
    /** blob url for the worker */
    url: string;
    /** memory for instantiating the wasm instance in this thread (dispatcher) */
    memory: WebAssembly.Memory;
    /** compiled module for instantiating the wasm instance in this thread (dispatcher) */
    wasm: WebAssembly.Module;
}

export const WORKER_MSG_READY = 1;
export const WORKER_MSG_SUCCESS = 0;
export const WORKER_MSG_PANIC = 2;
