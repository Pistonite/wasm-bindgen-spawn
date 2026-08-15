// import worker_threads from "node:worker_threads";
import fs from "node:fs";
import path from "node:path";
import { initSync, uninit, init_thread_creator, example_join_handle } from "../target/wasm-pack/unwind-web/example.js";

const TARGET = path.resolve(import.meta.dirname, "../target/wasm-pack");

const main = async () => {
    const wasm = fs.readFileSync(path.join(TARGET, "unwind-no-modules/example_bg.wasm"));
    const bgJs = fs.readFileSync(path.join(TARGET, "unwind-no-modules/example.js"), {encoding: "utf8"});
    initSync({module: wasm});
    const success = await init_thread_creator("console", bgJs, wasm);
    if (!success) {
        throw new Error("Failed to init thread creator in WASM!");
    }
    console.log("wasm-bindgen-thread intitialized");
    example_join_handle();

    await new Promise(r=>setTimeout(r,1000));

    uninit();
    
}


void main();
