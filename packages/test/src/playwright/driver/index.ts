const main = async () => {
    // parse the url
    let pathname = location.pathname;
    if (pathname.endsWith("/index.html")) {
        pathname = pathname.substring(0, pathname.length-"/index.html".length);
    } else {
        setOutput("error: invalid url!");
        return;
    }
    const [profile, panicRuntime, host, target] = pathname.substring(pathname.lastIndexOf("/")).trim().split("-", 4);
    const quad = `${profile}-${panicRuntime}-${host}-${target}`;
    switch (target) {
        case "no-modules": {
            const scriptPath = `/bundle/${quad}/example.js`;
            const script = await (await fetch(scriptPath)).text();
            const wasmPath = `/bundle/${quad}/example_bg.wasm`;
            const wasmBytes = await (await fetch(wasmPath)).arrayBuffer();
            const workerPath = `/bundle/${quad}/worker.js`;
            const workerScript = await (await fetch(workerPath)).text();
            const bindgenScript = script+"\n;globalThis.__harness_fetch_endpoint="+JSON.stringify("/harness/"+quad)+";\n";
            const combinedScript = bindgenScript+workerScript;
            const url = URL.createObjectURL(new Blob([combinedScript], { type: "text/javascript" }));

            const worker = new Worker(url);
            worker.onmessage = (e) => {
                const d = e.data;
                setOutput(d);
                if (d === "started") {
                    worker.postMessage({wasmBytes,bindgenScript});
                }
                if (d === "done") {
                    worker.terminate();
                    URL.revokeObjectURL(url);
                }
            };
            break;
        }
    }
};

const setOutput = (output: string) => {
    const out = document.getElementById("-out-");
    if (out) {
        out.innerText=output;
    }
}

void main();
