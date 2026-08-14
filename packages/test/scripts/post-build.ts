import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

const DRY_RUN = process.argv.includes("--dry-run");

const PANIC_MODES = ["unwind", "abort"];
const TARGETS = ["no-modules", "web", "nodejs", "deno", "bundler"];
const NO_WBG_MODULE_TARGETS = ["deno", "bundler"];
const TARGET_DIR = path.resolve(import.meta.dirname, "../target/wasm-pack");
const BG_WASM_DTS = "example_bg.wasm.d.ts";
const BG_WASM = "example_bg.wasm";
const BG_WASM_NO_WBG_MODULE = "example_bg_no_wbg_module.wasm";

const main = () => {
    // check _bg.wasm.d.ts

    for (const m of PANIC_MODES) {
        let bgWasmDTsHash = "";
        let bgWasmHash = "";
        let bgWasmHashNoWbgModule = "";
        for (const t of TARGETS) {
            const dir = path.join(TARGET_DIR, `${m}-${t}`);
            const bgWasmDTsPath = path.join(dir,BG_WASM_DTS);
            const bgWasmDTs = fs.readFileSync(bgWasmDTsPath, {encoding:"utf8"});
            const newBgWasmDTsHash = sha256(bgWasmDTs);
            if (!bgWasmDTsHash) {
                bgWasmDTsHash = newBgWasmDTsHash;
            } else if (bgWasmDTsHash != newBgWasmDTsHash){
                throw new Error(`_bg.wasm.d.ts mismatch for ${m}-${t}`);
            }
            const bgWasmPath = path.join(dir,BG_WASM);
            const bgWasm = fs.readFileSync(bgWasmPath);
            const newBgWasmHash = sha256(bgWasm);
            if (NO_WBG_MODULE_TARGETS.includes(t)) {
                if (!bgWasmHashNoWbgModule) {
                    bgWasmHashNoWbgModule = newBgWasmHash;
                } else if (bgWasmHashNoWbgModule != newBgWasmHash){
                    throw new Error(`_bg.wasm mismatch for ${m}-${t}`);
                }
            } else {
                if (!bgWasmHash) {
                    bgWasmHash = newBgWasmHash;
                } else if (bgWasmHash != newBgWasmHash){
                    throw new Error(`_bg.wasm mismatch for ${m}-${t}`);
                }
            }
        }
        const modeSharedOutputDir = path.join(TARGET_DIR, m);
        if (!fs.existsSync(modeSharedOutputDir)) {
            fs.mkdirSync(modeSharedOutputDir);
        }
        fs.copyFileSync(
            path.join(TARGET_DIR, `${m}-${TARGETS[0]}`, BG_WASM_DTS),
            path.join(modeSharedOutputDir, BG_WASM_DTS)
        );
        const moduleTarget = TARGETS.filter((t) => !NO_WBG_MODULE_TARGETS.includes(t))[0];
        fs.copyFileSync(
            path.join(TARGET_DIR, `${m}-${moduleTarget}`, BG_WASM),
            path.join(modeSharedOutputDir, BG_WASM)
        );
        fs.copyFileSync(
            path.join(TARGET_DIR, `${m}-${NO_WBG_MODULE_TARGETS[0]}`, BG_WASM),
            path.join(modeSharedOutputDir, BG_WASM_NO_WBG_MODULE)
        );
        if (!DRY_RUN) {
            for (const t of TARGETS) {
                const dir = path.join(TARGET_DIR, `${m}-${t}`);
                fs.rmSync(path.join(dir, BG_WASM_DTS))
                fs.rmSync(path.join(dir, BG_WASM))
            }
        }
    }
}


const sha256 = (input: crypto.BinaryLike | string): string => {
    return crypto.createHash("sha256").update(input).digest("hex")
}

main();
