import fs from "node:fs";
import path from "node:path";

import { getTargetSubdir, measure, type DenoWasmBundle } from "#framework";

import { setupGlobalHarnessOutputPath } from "./util.ts";

const main = async () => {
    const quad = process.argv[2];
    if (!quad) {
        throw new Error("invalid quad, usage: node <driver_script>.ts <quad> <test_filters>...");
    }
    if (!quad.endsWith("deno")) {
        throw new Error("misconfigured quad, this driver can only run deno, got "+quad);
    }
    const filters = process.argv.slice(3);
    // use the web target for initialization of worker threads 
    const bindgenJsQuad = quad.replace(/-deno$/, "-web");
    const wasmBindgenJs = setupGlobalHarnessOutputPath(quad + ".log", bindgenJsQuad + "/example.js");
    const [wasm_bindgen, wasmModule ] = await importDenoWasmBundle(quad);
    const success = await wasm_bindgen.init_thread_creator(
        "node-fs",
        "web",
        wasmBindgenJs,
        wasmModule,
    );
    if (!success) {
        throw new Error("Failed to init thread creator in WASM!");
    }
    const examples = Object.keys(wasm_bindgen).filter((x) => x.startsWith("example_"));
    for (const testCase of examples) {
        const shouldRun = !filters.length || filters.some((x) => testCase.includes(x));
        if (!shouldRun) {
            continue;
        }
        measure(testCase, () => {
            const fn = wasm_bindgen[testCase as keyof typeof wasm_bindgen] as () => void;
            fn();
        });
    }

    wasm_bindgen.uninit();
};

const importDenoWasmBundle = async (bundle: string) => {
    const targetBundleDir = getTargetSubdir("bundle");
    const esmImportPath = path.join(targetBundleDir, bundle, "example.js");
    const wasm_bindgen = await import(esmImportPath) as DenoWasmBundle;
    // deno bundle auto initializes the wasm module
    // however the wasm_bindgen::module() is not available and we need to pass that in
    // to the thread creator
    const wasm = fs.readFileSync(path.join(targetBundleDir, bundle, "example_bg.wasm"));
    return [wasm_bindgen, wasm] as const;
};

void main();
