import { importNodeNoModulesWasmBundle, setupGlobalHarnessOutputPath } from "./test_framework.ts";

const main = async () => {
    const wasmBindgenJs = 
    setupGlobalHarnessOutputPath("release-unwind-node-no-modules.log", 
        "release-unwind-node-no-modules/example.js"
    );
    const [wasm_bindgen, wasmModule] = 
        await importNodeNoModulesWasmBundle("release-unwind-node-no-modules");
    wasm_bindgen.initSync({module: wasmModule});
const success = await wasm_bindgen.init_thread_creator("node-fs", "no-modules", wasmBindgenJs, undefined);
    if (!success) {
        throw new Error("Failed to init thread creator in WASM!");
    }
    wasm_bindgen.example_join_handle();

    wasm_bindgen.uninit();
    
}


void main();
