import fs from "node:fs";
import path from "node:path";

import {
    type DenoWasmBundle,
    getTargetSubdir,
    type NodeWasmBundle,
    type ViteWasmBundle,
    type WebWasmBundle,
    type NoModulesWasmBundle,
    type WasmBundle,
    getTestSelection,
    measure,
    getCurrentEngineName,
    saveLogFile,
} from "#framework";

const main = async () => {
    const triple = process.argv[2];
    if (!triple) {
        throw new Error(
            "invalid triple, usage: node <driver_script>.ts <triple> <test_filters>...",
        );
    }
    const [profile, panicRuntime] = triple.split("-", 2);
    const prefix = `${profile}-${panicRuntime}`;
    const target = triple.substring(prefix.length + 1);
    const testFilters = process.argv.slice(3);

    const bindgenScript = fs.readFileSync(
        path.join(
            getTargetSubdir("bundle"),
            triple,
            target === "no-modules" || target === "web" ? "example.js" : "example_web.js",
        ),
        {
            encoding: "utf8",
        },
    );
    const [wasm_bindgen, wasmModule] = await importAndInitWasmBundle(target, triple);

    await runTests(
        wasm_bindgen,
        target === "no-modules" ? "no-modules" : "web",
        bindgenScript,
        target === "deno" || target === "vite" ? wasmModule : undefined,
        triple,
        testFilters,
    );
};

const importAndInitWasmBundle = async (target: string, triple: string) => {
    const targetBundleDir = getTargetSubdir("bundle");
    switch (target) {
        case "no-modules": {
            const esmImportPath = path.join(targetBundleDir, triple, "example_esm.js");
            const wasm = fs.readFileSync(path.join(targetBundleDir, triple, "example_bg.wasm"));
            const { default: wasm_bindgen } = await import(esmImportPath);
            wasm_bindgen.initSync({ module: wasm });
            return [wasm_bindgen as NoModulesWasmBundle, wasm] as const;
        }
        case "web": {
            const esmImportPath = path.join(targetBundleDir, triple, "example.js");
            const wasm = fs.readFileSync(path.join(targetBundleDir, triple, "example_bg.wasm"));
            const wasm_bindgen = await import(esmImportPath);
            wasm_bindgen.initSync({ module: wasm });
            return [wasm_bindgen as WebWasmBundle, wasm] as const;
        }
        case "nodejs": {
            const esmImportPath = path.join(targetBundleDir, triple, "example.cjs");
            const wasm_bindgen = (await import(esmImportPath)) as NodeWasmBundle;
            // nodejs bundle auto initializes the wasm module on the main thread
            return [wasm_bindgen] as const;
        }
        case "deno": {
            const esmImportPath = path.join(targetBundleDir, triple, "example.js");
            const wasm_bindgen = (await import(esmImportPath)) as DenoWasmBundle;
            // deno bundle auto initializes the wasm module
            // however the wasm_bindgen::module() is not available and we need to pass that in
            // to the thread creator
            const wasm = fs.readFileSync(path.join(targetBundleDir, triple, "example_bg.wasm"));
            return [wasm_bindgen, wasm] as const;
        }
        case "vite": {
            const esmImportPath = path.join(targetBundleDir, triple, "example.js");
            const wasm_bindgen = (await import(esmImportPath)) as ViteWasmBundle;
            // the bundler would have to already initialize the wasm instance
            // the wasm_bindgen::module() is not available in bundler target
            // so we read the wasm copy again
            const wasm = fs.readFileSync(
                path.join(getTargetSubdir("bundle"), triple, "example_bg.wasm"),
            );
            return [wasm_bindgen, wasm] as const;
        }
        default: {
            throw new Error("invalid target: " + target);
        }
    }
};

const runTests = async (
    wasm_bindgen: WasmBundle,
    bgTarget: string,
    bgScript: string,
    wasmModule: unknown,
    triple: string,
    testFilters: string[],
) => {
    const success = await wasm_bindgen.init_thread_creator(bgTarget, bgScript, wasmModule);
    if (!success) {
        throw new Error("Failed to init thread creator in WASM!");
    }
    const examples = Object.keys(wasm_bindgen).filter((x) => x.startsWith("example_"));
    for (const testCase of getTestSelection(examples, testFilters)) {
        measure(testCase, () => {
            const fn = wasm_bindgen[testCase as keyof typeof wasm_bindgen] as () => void;
            fn();
        });
        // wait some time to allow IO/console.log to flush
        await new Promise((r) => setTimeout(r, 100));
    }
    wasm_bindgen.uninit();
    const log = wasm_bindgen.get_log();
    saveLogFile(getCurrentEngineName(), triple, log);
};

void main();
