import path from "node:path";
import fs from "node:fs";
import child_process from "node:child_process";

import type { Plugin, UserConfig } from "mono-dev/vite";
import { configure } from "mono-dev/lib-build-config";

const plugin: Plugin = {
    name: "post-process",
    apply: "build",
    closeBundle: () => {
        const distDir = path.resolve(import.meta.dirname, "dist");
        const dispatcherCode = wrapExport(bundle(path.join(distDir, "dispatcher.js")));
        const dispatcherExpr = JSON.stringify(dispatcherCode);
        const workerCode = wrapExport(bundle(path.join(distDir, "worker.js")));
        const workerExpr = JSON.stringify(workerCode);
        const createCode = bundle(path.join(distDir, "create.js"));
        const output =
            `let __return,DISPATCHER_JS=${dispatcherExpr},WORKER_JS=${workerExpr};${createCode};return __return;`;
        fs.writeFileSync(
            path.resolve(import.meta.dirname, "..", "lib", "src", "dispatcher.js"),
            output,
        );
        const size = output.length;
        console.log(`bundled script written to /packages/lib/src/dispatcher.js (${size} bytes)`);
    },
};

const bundle = (script: string): string => {
    // using bun to post process vite's output to bundle the chunks into one js file
    return child_process.execSync("bun build --minify " + script, { encoding: "utf8" });
};
const wrapExport = (script: string): string => {
    return `const _m=(()=>{let __export;${script};return __export})();`;
}

export default <UserConfig>configure({
    plugins: [plugin],
    define: {
        __DEBUG__: true
    }
});
