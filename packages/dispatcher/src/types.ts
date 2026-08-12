import type { NonNull } from "./binding.gen.ts";

/** Message posted from the dispatcher to the worker for initialization */
export interface WorkerInitMessage {
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

/** Message posted from the thread creator to the dispatcher for initialization */
export interface DispatcherInitMessage {
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
