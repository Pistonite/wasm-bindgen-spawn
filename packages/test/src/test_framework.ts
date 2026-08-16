import fs from "node:fs";
import path from "node:path";

import { getCurrentEngineName, TARGET_BUNDLE, TARGET_TEST } from "#framework";


/**
 * Set the harness output path for the node-fs harness in the example lib.
 * Also injects the setup into the bg script and return the injected script
 */
export const setupGlobalHarnessOutputPath = (
    harnessOutputPath: string,
    bgScriptPath: string
): string => {
    const absHarnessOutputPath = path.join(TARGET_TEST, getCurrentEngineName(), harnessOutputPath);
    if(fs.existsSync(absHarnessOutputPath)){
        fs.rmSync(absHarnessOutputPath, {recursive:true,force:true})
    }
    fs.mkdirSync(path.dirname(absHarnessOutputPath), { recursive: true });
        const bgScript = fs.readFileSync(path.join(TARGET_BUNDLE, bgScriptPath), {encoding: "utf8"});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__harness_output_path = absHarnessOutputPath;
    return bgScript+"\n;globalThis.__harness_output_path="+JSON.stringify(absHarnessOutputPath)+";\n";
}

export const importNodeNoModulesWasmBundle = async (bundle: string) => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    type NoModulesWasmBundleAsEsm = typeof import("../target/bundle/debug-unwind-node-no-modules/example_esm.js");
    const esmImportPath = path.join(TARGET_BUNDLE, bundle, "example_esm.js");
    const {default: wasm_bindgen} = await import(esmImportPath);
    const wasm = fs.readFileSync(path.join(TARGET_BUNDLE, bundle, "example_bg.wasm"));
        return [wasm_bindgen as NoModulesWasmBundleAsEsm, wasm] as const;
}

