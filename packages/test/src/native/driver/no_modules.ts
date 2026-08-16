import fs from "node:fs";
import path from "node:path";

import { getTargetSubdir, measure, type NoModulesWasmBundle } from "#framework";

import { setupGlobalHarnessOutputPath } from "./util.ts";

const main = async () => {
    const quad = process.argv[2];
    if (!quad) {
        throw new Error("invalid quad, usage: node <driver_script>.ts <quad>");
    }
    const wasmBindgenJs = setupGlobalHarnessOutputPath(quad + ".log", quad + "/example.js");
    const [wasm_bindgen, wasmModule] = await importNodeNoModulesWasmBundle(quad);
    wasm_bindgen.initSync({ module: wasmModule });
    const success = await wasm_bindgen.init_thread_creator(
        "node-fs",
        "no-modules",
        wasmBindgenJs,
        undefined,
    );
    if (!success) {
        throw new Error("Failed to init thread creator in WASM!");
    }
    measure("example_join_handle", () => {
        wasm_bindgen.example_join_handle();
    });
    measure("example_mpsc_channel", () => {
        wasm_bindgen.example_mpsc_channel();
    });

    wasm_bindgen.uninit();
};

const importNodeNoModulesWasmBundle = async (bundle: string) => {
    const targetBundleDir = getTargetSubdir("bundle");
    const esmImportPath = path.join(targetBundleDir, bundle, "example_esm.js");
    const { default: wasm_bindgen } = await import(esmImportPath);
    const wasm = fs.readFileSync(path.join(targetBundleDir, bundle, "example_bg.wasm"));
    return [wasm_bindgen as NoModulesWasmBundle, wasm] as const;
};

void main();
