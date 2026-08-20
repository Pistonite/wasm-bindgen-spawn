import fs from "node:fs";
import path from "node:path";

import {
    getCurrentEngineName,
    getTargetSubdir,
    getTestSelection,
    measure,
    type WasmBundle,
} from "#framework";

export const runTests = async (
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
    }
    wasm_bindgen.uninit();
    const log = wasm_bindgen.get_log();
    const logOutputPath = path.join(
        getTargetSubdir("test"),
        getCurrentEngineName(),
        triple + ".log",
    );
    if (fs.existsSync(logOutputPath)) {
        fs.rmSync(logOutputPath, { force: true });
    }
    fs.mkdirSync(path.dirname(logOutputPath), { recursive: true });
    fs.writeFileSync(logOutputPath, log);
};
