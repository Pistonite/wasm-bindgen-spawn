
export const createJsBlobUrl = (script: string): string => {
    return URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
}

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
        if (import.meta.env.BUILD_DEBUG) {
            worker.on("exit", async () => {
                await __debugImpl("worker exit");
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
                parentPort.on('message', cb);
            },
            postMessage: parentPort.postMessage.bind(parentPort),
        }
    } catch(e) {
        throw new Error("Failed to setup worker global scope", {cause: e});
    }
}

export const __debugImpl = async (...x: unknown[]) => {
    try {
        const fs=await new Function("return import('fs')")();
        for (const m of x){
            if (typeof m === "string") {
                try {
                    fs.writeSync(process.stdout.fd, "[debug]"+m + "\n");
                } catch {
                    console.log(x);
                }
                continue;
            }
            try {
                const mJson = JSON.stringify(m,undefined,2);
                try {
                    fs.writeSync(process.stdout.fd, "[debug]"+mJson + "\n");
                } catch {
                    console.log(x);
                }
                continue;
            } catch {
                const mStr = `${m}`;
                try {
                    fs.writeSync(process.stdout.fd, "[debug]"+mStr + "\n");
                } catch {
                    console.log(x);
                }
            }
        }
    } catch {
        console.log(...x);
    }
}
