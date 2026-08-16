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
    const [profile, panicRuntime, host] = pathnamePart.split("-", 3);
    const prefix = `${profile}-${panicRuntime}-${host}`;
    const target = pathnamePart.substring(prefix.length + 1);
    const quad = `${prefix}-${target}`;

    console.log(`starting web worker for quad: ${quad}`);

    const testFilters =
        new URLSearchParams(location.search)
            .get("tests")
            ?.split(",")
            ?.map((x) => x.trim()) || [];

    switch (target) {
        case "no-modules": {
            const scriptPath = location.origin + `/bundle/${quad}/example.js`;
            const script = await (await fetch(scriptPath)).text();
            const wasmPath = location.origin + `/bundle/${quad}/example_bg.wasm`;
            const wasmBytes = await (await fetch(wasmPath)).arrayBuffer();
            const workerPath = location.origin + `/bundle/${quad}/worker.js`;
            const workerScript = await (await fetch(workerPath)).text();
            const bindgenScript =
                script +
                "\n;globalThis.__harness_fetch_endpoint=" +
                JSON.stringify(location.origin + "/harness/" + quad) +
                ";\n";
            const combinedScript = bindgenScript + workerScript;
            const url = URL.createObjectURL(
                new Blob([combinedScript], { type: "text/javascript" }),
            );

            const worker = new Worker(url);
            worker.onmessage = (e) => {
                const d = e.data;
                setOutput(d);
                if (d === "started") {
                    worker.postMessage({ testFilters, wasmBytes, bindgenScript });
                }
                if (d === "done") {
                    worker.terminate();
                    URL.revokeObjectURL(url);
                }
            };
            break;
        }

        default:
            setOutput("error: invalid quad: " + quad);
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
