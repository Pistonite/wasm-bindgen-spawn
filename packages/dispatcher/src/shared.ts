export const createJsBlobUrl = (script: string): string => {
    return URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
};

export interface WorkerAdapter {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listen: (cb: (e: any) => void) => void;
    postMessage: (e: unknown) => void;
    terminate: () => void;
}

export interface WorkerGlobalScopeAdapter {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listen: (cb: (e: any) => void) => void;
    postMessage: (e: unknown) => void;
    terminate: () => void;
}

export const createWorker = async (url: string, useESWorker: boolean): Promise<WorkerAdapter> => {
    if (typeof Worker === "function") {
        // Deno does not support classic workers, only ES workers,
        // Deno's node:worker_threads also does not allow either require or import (what the f)
        // which doesn't let us set up the fs hook needed for test harness
        // @ts-expect-error Deno global
        if (typeof Deno !== "undefined") {
            useESWorker = true;
        }
        __debug("using WebWorker");
        try {
            const worker = useESWorker ? new Worker(url, { type: "module" }) : new Worker(url);
            return {
                listen: (cb) => (worker.onmessage = ({ data }) => cb(data)),
                postMessage: worker.postMessage.bind(worker),
                terminate: worker.terminate.bind(worker),
            };
        } catch (e) {
            console.error(e);
            throw new Error("Worker is not supported in this environment", { cause: e });
        }
    }
    try {
        const worker_threads = await new Function(`return import("node:worker_threads")`)();
        const script = await (await fetch(url)).text();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const worker = new worker_threads.Worker(script, { eval: true }) as any;
        if (import.meta.env.BUILD_DEBUG) {
            worker.on("exit", async () => {
                __debug("worker exit");
            });
        }
        __debug("using node:worker_threads");
        return {
            listen: (cb) => worker.on("message", cb),
            postMessage: worker.postMessage.bind(worker),
            terminate: worker.terminate.bind(worker),
        };
    } catch (e) {
        console.error(e);
        throw new Error("Worker is not supported in this environment", { cause: e });
    }
};

export const getWorkerGlobalScope = async (): Promise<WorkerGlobalScopeAdapter> => {
    if (typeof self !== "undefined") {
        __debug("using WorkerGlobalScope");
        return {
            listen: (cb) => (self.onmessage = ({ data }) => cb(data)),
            postMessage: self.postMessage.bind(self),
            terminate: () => self.close(),
        };
    }
    try {
        __debug("using node:worker_threads parentPort");
        const worker_threads = await new Function(`return import("node:worker_threads")`)();
        const parentPort = worker_threads.parentPort;
        return {
            listen: (cb) => parentPort.on("message", cb),
            postMessage: parentPort.postMessage.bind(parentPort),
            terminate: parentPort.close.bind(parentPort),
        };
    } catch (e) {
        throw new Error("Failed to setup worker global scope", { cause: e });
    }
};

export const __debugInitImpl = async () => {
    // using fs allows us to bypass the js event loop
    // and make the messages appear more or less in the order they are logged
    try {
        const fs = await new Function("return import('fs')")();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).__debug_hook =  (...x: unknown[]) => {
            for (const m of x) {
                if (typeof m === "string") {
                    try {
                        fs.writeSync(1, "[debug] " + m + "\n");
                    } catch (e) {
                        console.error(e);
                        console.log(m);
                    }
                    continue;
                }
                try {
                    const mJson = JSON.stringify(m, undefined, 2);
                    try {
                        fs.writeSync(1, "[debug] " + mJson + "\n");
                    } catch (e) {
                        console.error(e);
                        console.log(m);
                    }
                    continue;
                } catch {
                    const mStr = `${m}`;
                    try {
                        fs.writeSync(1, "[debug] " + mStr + "\n");
                    } catch (e) {
                        console.error(e);
                        console.log(m);
                    }
                }
            }
        }
    } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).__debug_hook =  (...x: unknown[]) => {
            console.log(...x);
        }
    }
}
