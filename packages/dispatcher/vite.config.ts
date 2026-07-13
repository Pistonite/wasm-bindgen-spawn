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
        const output =
            "let RETURN;let DISPATCHER_JS=`" +
            minify(path.join(distDir, "dispatcher.js")) +
            "`;let WORKER_JS=`" +
            minify(path.join(distDir, "worker.js")) +
            "`;" +
            minify(path.join(distDir, "create.js")) +
            "return RETURN";
        fs.writeFileSync(
            path.resolve(import.meta.dirname, "..", "lib", "src", "dispatcher.js"),
            output,
        );
        const size = output.length;
        console.log(`bundled script written to /packages/lib/src/dispatcher.js (${size} bytes)`);
    },
};

// using vite to minify (oxc) than use bun generates code that is a few bytes smaller
const minify = (script: string): string => {
    const output = child_process.execSync("bun build --minify "+script, {encoding:"utf8"});
    if (output.includes("`")) {
        throw new Error("unexpected backtick in output; the script is not safe to embed");
    }
    return output;
};

export default <UserConfig>configure({
    plugins: [plugin],
});
