import child_process from "node:child_process";
import path from "node:path";

import {
    getTargetDir,
    getTargetTestTriples,
    NATIVE_ENGINES,
    parseCommandLineArgs,
    type NativeEngine,
} from "#framework";

const main = async () => {
    const { engines, tripleFilters, testFilters } = parseCommandLineArgs(
        process.argv.slice(2),
        NATIVE_ENGINES,
    );
    if (engines.length === 0) {
        engines.push(...NATIVE_ENGINES);
    }

    const triples = getTargetTestTriples(tripleFilters, false /* isBrowser */);
    if (!triples.length) {
        console.error("no tests specified");
        process.exit(1);
    }

    const failed: string[] = [];
    // run quad one at a time to avoid overwhelm all cores
    for (const triple of triples) {
        const results = await Promise.all(
            engines.map(
                async (engine) =>
                    [engine, await runTestForTriple(engine, triple, testFilters)] as const,
            ),
        );
        for (const [engine, ok] of results) {
            if (!ok) {
                failed.push(`${engine}/${triple}`);
            }
        }
    }
    if (failed.length) {
        console.error(`failed: ${failed.join(", ")}`);
        process.exit(1);
    }
    console.log("native tests finished");
};

const runTestForTriple = async (
    engine: NativeEngine,
    triple: string,
    testFilters: string[],
): Promise<boolean> => {
    if (engine === "deno" && triple.endsWith("-nodejs")) {
        // skip nodejs tests in unsupported engines
        return true;
    }
    if (engine === "node" && triple.endsWith("-deno")) {
        // skip deno tests in unsupported engines
        return true;
    }
    const script = path.resolve(import.meta.dirname, "driver.ts");
    const [command, ...args] = getEngineCommand(engine, script, triple, testFilters);
    const prefix = `[${engine}/${triple}]`;

    console.log(`running ${engine} ${triple}`);
    return await new Promise<boolean>((resolve) => {
        const child = child_process.spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
        let pending = "";
        const onData = (chunk: Buffer) => {
            pending += chunk.toString("utf8");
            const lines = pending.split("\n");
            pending = lines.pop() ?? "";
            for (const line of lines) {
                process.stdout.write(prefix + line + "\n");
            }
        };
        const flush = () => {
            if (pending) {
                process.stdout.write(prefix + pending + "\n");
                pending = "";
            }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", (e) => {
            // most likely the engine simply isn't installed
            console.error(`${prefix}failed to spawn ${command}: ${e.message}`);
            resolve(false);
        });
        child.on("close", (code) => {
            flush();
            if (code !== 0) {
                console.error(`${prefix}exited with code ${code}`);
            }
            resolve(code === 0);
        });
    });
};

const getEngineCommand = (
    engine: NativeEngine,
    script: string,
    triple: string,
    testFilters: string[],
): string[] => {
    const targetDir = getTargetDir();
    switch (engine) {
        case "node":
            return ["node", script, triple, ...testFilters];
        case "bun":
            return ["bun", script, triple, ...testFilters];
        case "deno":
            // needs full permissions to read the bundles and write the harness logs
            return [
                "deno",
                "--allow-read=" + targetDir,
                "--allow-write=" + targetDir,
                script,
                triple,
                ...testFilters,
            ];
    }
};

void main();
