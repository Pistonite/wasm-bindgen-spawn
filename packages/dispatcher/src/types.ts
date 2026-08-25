import type { OpaqueWebAssemblyModule, RustType, WasmBindgen } from "./binding.gen.ts";

export type WasmBindgenInitFn = (init: {
    memory: WebAssembly.Memory;
    module: OpaqueWebAssemblyModule | BufferSource;
}) => void;
export type WorkerInitArgs = WasmBindgen & { initSync: WasmBindgenInitFn };

/** Message posted from the dispatcher to the worker for initialization */
export interface WorkerInitMessage {
    /** main rust closure to execute */
    f: RustType<"*mut ThreadProc">;
    /** sender for the return value */
    send: RustType<"*mut ValueSender">;
    /** sender for the start signal */
    start: RustType<"*mut SignalSender">;
    /** memory for instantiating the wasm instance in this thread (worker) */
    memory: WebAssembly.Memory;
    /** module for instantiating the wasm instance in this thread (worker) */
    wasm: OpaqueWebAssemblyModule | BufferSource;
}

/** Message posted from the thread creator to the dispatcher for initialization */
export interface DispatcherInitMessage {
    /** receiver for thread-spawn requests */
    recv: RustType<"*mut DispatchReceiver">;
    /** signal to indicate the dispatcher is ready */
    start_send: RustType<"*mut SignalSender">;
    /** code to spawn workers */
    script: string;
    /** memory for instantiating the wasm instance in this thread (dispatcher) */
    memory: WebAssembly.Memory;
    /** module for instantiating the wasm instance in this thread (dispatcher) */
    wasm: OpaqueWebAssemblyModule | BufferSource;
    /** Create worker with { type: module } */
    useESWorker: boolean;
}
