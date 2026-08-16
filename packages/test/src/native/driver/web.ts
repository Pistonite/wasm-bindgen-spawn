import fs from "node:fs";
import path from "node:path";

import { getTargetSubdir, measure, type WebWasmBundle } from "#framework";

import { setupGlobalHarnessOutputPath } from "./util.ts";

const main = async () => {
    const quad = process.argv[2];
    if (!quad) {
        throw new Error("invalid quad, usage: node <driver_script>.ts <quad> <test_filters>...");
    }
    if (!quad.endsWith("web")) {
        throw new Error("misconfigured quad, this driver can only run web, got "+quad);
    }
    const filters = process.argv.slice(3);
    const wasmBindgenJs = setupGlobalHarnessOutputPath(quad + ".log", quad + "/example.js");
    const [wasm_bindgen, wasmModule] = await importNodeWebWasmBundle(quad);
    wasm_bindgen.initSync({ module: wasmModule });
    const success = await wasm_bindgen.init_thread_creator(
        "node-fs",
        "web",
        wasmBindgenJs,
        undefined,
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

const importNodeWebWasmBundle = async (bundle: string) => {
    const targetBundleDir = getTargetSubdir("bundle");
    const esmImportPath = path.join(targetBundleDir, bundle, "example.js");
    // bun has a bug where imports are not resolved when importing the module as data url
    // so we will do a workaround to inject it from the importer
    const wasm_bindgen = await import(esmImportPath);
    const wasm = fs.readFileSync(path.join(targetBundleDir, bundle, "example_bg.wasm"));
    return [wasm_bindgen as WebWasmBundle, wasm] as const;
};

void main();
