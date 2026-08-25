const main = async () => {
    // parse the url
    let pathname = location.pathname;
    if (pathname.endsWith("/index.html")) {
        pathname = pathname.substring(0, pathname.length - "/index.html".length);
    } else {
        setOutput("error: invalid url!");
        return;
    }
    const pathnamePart = pathname.substring(pathname.lastIndexOf("/") + 1).trim();
    const [profile, panicRuntime] = pathnamePart.split("-", 2);
    const prefix = `${profile}-${panicRuntime}`;
    const target = pathnamePart.substring(prefix.length + 1);
    const triple = `${prefix}-${target}`;

    console.log(`starting web worker for triple: ${triple}`);

    const testFilters =
        new URLSearchParams(location.search)
            .get("tests")
            ?.split(",")
            ?.map((x) => x.trim()) || [];

    const logOutputEndpoint = location.origin + "/harness/" + triple;
    const wasmPath = location.origin + `/bundle/${triple}/example_bg.wasm`;
    const wasmBytes = await (await fetch(wasmPath)).arrayBuffer();

    switch (target) {
        case "no-modules": {
            const scriptPath = location.origin + `/bundle/${triple}/example.js`;
            const bindgenScript = await (await fetch(scriptPath)).text();

            // inject the wasm_bindgen into the worker script
            const workerPath = location.origin + `/bundle/${triple}/worker.js`;
            const workerScript = await (await fetch(workerPath)).text();
            const combinedScript = bindgenScript + workerScript;
            const url = URL.createObjectURL(
                new Blob([combinedScript], { type: "text/javascript" }),
            );

            const worker = new Worker(url);
            worker.onmessage = (e) => {
                const d = e.data;
                setOutput(d);
                if (d === "started") {
                    worker.postMessage({
                        logOutputEndpoint,
                        target,
                        testFilters,
                        wasmBytes,
                        bindgenScript,
                    });
                }
                if (d === "done") {
                    worker.terminate();
                    URL.revokeObjectURL(url);
                }
            };
            break;
        }
        case "web": {
            const scriptPath = location.origin + `/bundle/${triple}/example.js`;
            const bindgenScript = await (await fetch(scriptPath)).text();

            const workerPath = location.origin + `/bundle/${triple}/worker.js`;
            const worker = new Worker(workerPath, { type: "module" });
            worker.onmessage = (e) => {
                const d = e.data;
                setOutput(d);
                if (d === "started") {
                    worker.postMessage({
                        logOutputEndpoint,
                        target,
                        testFilters,
                        wasmBytes,
                        bindgenScript,
                    });
                }
                if (d === "done") {
                    worker.terminate();
                }
            };
            break;
        }
        case "vite": {
            const scriptPath = location.origin + `/bundle/${triple}/example_web.js`;
            const bindgenScript = await (await fetch(scriptPath)).text();

            const workerPath = location.origin + `/bundle/${triple}/worker.js`;
            const worker = new Worker(workerPath, { type: "module" });
            worker.onmessage = (e) => {
                const d = e.data;
                setOutput(d);
                if (d === "started") {
                    worker.postMessage({
                        logOutputEndpoint,
                        target,
                        testFilters,
                        wasmBytes,
                        bindgenScript,
                    });
                }
                if (d === "done") {
                    worker.terminate();
                }
            };
            break;
        }

        default:
            setOutput("error: invalid triple: " + triple);
    }
};

const setOutput = (output: string) => {
    console.log(output);
    const out = document.getElementById("-out-");
    if (out) {
        out.innerText = output;
    }
};

void main();
