import fs from "node:fs";
import path from "node:path";

import { getCurrentEngineName, getTargetSubdir } from "#framework";

/**
 * Set the harness output path for the node-fs harness in the example lib.
 * Also injects the setup into the bg script and return the injected script
 */
export const setupGlobalHarnessOutputPath = (
    harnessOutputPath: string,
    bgScriptPath: string,
): string => {
    const absHarnessOutputPath = path.join(
        getTargetSubdir("test"),
        getCurrentEngineName(),
        harnessOutputPath,
    );
    if (fs.existsSync(absHarnessOutputPath)) {
        fs.rmSync(absHarnessOutputPath, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(absHarnessOutputPath), { recursive: true });
    const bgScript = fs.readFileSync(path.join(getTargetSubdir("bundle"), bgScriptPath), {
        encoding: "utf8",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__harness_output_path = absHarnessOutputPath;
    return (
        bgScript +
        "\n;globalThis.__harness_output_path=" +
        JSON.stringify(absHarnessOutputPath) +
        ";\n"
    );
};
