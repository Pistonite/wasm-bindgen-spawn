import path from "node:path";
import fs from "node:fs";
import child_process from "node:child_process";

import type { Plugin, UserConfig } from "mono-dev/vite";
import { configure } from "mono-dev/lib-build-config";

const BUILD_DEBUG = false; // include debug outputs

const plugin: Plugin = {
    name: "post-process",
    apply: "build",
    closeBundle: () => {
        const distDir = path.resolve(import.meta.dirname, "dist");
        const dispatcherCode = wrapExport(bundle(path.join(distDir, "dispatcher.js")));
        const dispatcherExpr = serializeCode(dispatcherCode);
        const workerCode = wrapExport(bundle(path.join(distDir, "worker.js")));
        const workerExpr = serializeCode(workerCode);
        const createCode = bundle(path.join(distDir, "create.js"));
        const output = `let __return,DISPATCHER_JS=${dispatcherExpr},WORKER_JS=${workerExpr};${createCode};return __return;`;
        // ensure dead code elimination works
        if (!BUILD_DEBUG) {
            if (output.includes("[debug]") || output.includes("__debug")) {
                throw new Error("unexpected debug tag found in output");
            }
            if (output.includes("fs")) {
                throw new Error("unexpected fs tag found in output");
            }
            if (output.includes("console.log")) {
                throw new Error("unexpected console.log found in output");
            }
        }
        fs.writeFileSync(
            path.resolve(import.meta.dirname, "..", "lib", "src", "dispatcher.js"),
            output,
        );
        const size = output.length;
        console.log(
            `bundled script written to /packages/lib/src/dispatcher.js (${size} bytes ${BUILD_DEBUG ? "[DEBUG]" : ""})`,
        );
    },
};

const bundle = (script: string): string => {
    const command = BUILD_DEBUG ? "bun build " : "bun build --minify ";
    // using bun to post process vite's output to bundle the chunks into one js file
    return child_process.execSync(command + script, { encoding: "utf8" });
};
const wrapExport = (script: string): string => {
    return `const _m=(()=>{let __export;${script};return __export})();`;
};
const serializeCode = (code: string): string => {
    const expr = JSON.stringify(code);
    if (!BUILD_DEBUG) {
        return expr;
    }
    const lines = expr.substring(1, expr.length - 1).split("\\n");
    return lines.map((x) => `"${x}"`).join(`+"\\n"+\n`);
};

export default <UserConfig>configure({
    plugins: [plugin],
    define: {
        "import.meta.env.BUILD_DEBUG": BUILD_DEBUG,
        __debug: BUILD_DEBUG ? `globalThis.__debug_hook` : `(function(){})`,
        __debug_init: BUILD_DEBUG ? `(await import('./shared.ts')).__debugInitImpl` : `(function(){})`,
    },
});
