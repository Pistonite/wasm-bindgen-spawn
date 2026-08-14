

export interface WorkerAdapter {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listen: (cb: (e: any) => void) => void;
    postMessage: (e: unknown) => void
    terminate: () => void
}

export interface WorkerGlobalScopeAdapter {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listen: (cb: (e: any) => void) => void;
    postMessage: (e: unknown) => void
}

export const createWorker = async (url: string, useESWorker: boolean): Promise<WorkerAdapter> => {
    if (typeof Worker === "function") {
        const worker = useESWorker ? 
            new Worker(url, { type: "module" })
            :
            new Worker(url);
        return {
            listen: (cb) => worker.onmessage = ({data}) => cb(data),
            postMessage: worker.postMessage.bind(worker),
            terminate: worker.terminate.bind(worker),
        }
    }
    try {
        const worker_threads = await new Function(`return import("worker_threads")`)();
        const script = await (await fetch(url)).text();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const worker = new worker_threads.Worker(script, {eval: true}) as any;
        if (__DEBUG__) {
            worker.on("exit", () => {
                console.log("worker thread exited");
            });
        }
        return {
            listen: (cb) => worker.on('message', cb),
            postMessage: worker.postMessage.bind(worker),
            terminate: worker.terminate.bind(worker),
        }
    } catch(e) {
        throw new Error("Worker is not supported in this environment", {cause: e});
    }
}

export const getWorkerGlobalScope = async () : Promise<WorkerGlobalScopeAdapter> => {
    if (typeof self !== 'undefined') {
        return {
            listen: (cb) => self.onmessage = ({data})=>cb(data),
            postMessage: self.postMessage.bind(self)
        };
    }
    try {
        const worker_threads = await new Function(`return import("worker_threads")`)();
        const parentPort = worker_threads.parentPort;
        return {
            listen: (cb) => {
                if (__DEBUG__) {
                    console.log("attaching event listener to worker");
                }
                parentPort.on('message', cb);
            },
            postMessage: parentPort.postMessage.bind(parentPort),
        }
    } catch(e) {
        throw new Error("Failed to setup worker global scope", {cause: e});
    }
}
