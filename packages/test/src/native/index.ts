import child_process from "node:child_process";
import path from "node:path";

import {
    type Engine,
    getTargetDir,
    getTargetTestTriples,
    NATIVE_ENGINES,
    parseCommandLineArgs,
    type Triple,
} from "#framework";

const main = async () => {
    const { skip, one, engines, tripleFilters, testFilters } = parseCommandLineArgs(
        process.argv.slice(2),
        [...NATIVE_ENGINES],
    );
    if (skip) {
        return;
    }

    const triples = getTargetTestTriples(tripleFilters, one, false /* isBrowser */);
    if (!triples.length) {
        console.error("no tests specified");
        process.exit(1);
    }

    const tasks: [Engine, Triple][] = [];
    for (const triple of triples) {
        for (const engine of engines) {
            // bun v1.3.14/v1.4.0 currently has a bug where it seg faults when trying to grow shared memory
            if (engine === "bun") {
                continue;
            }
            if (engine === "deno" && triple.endsWith("-nodejs")) {
                // skip nodejs tests in unsupported engines
                continue;
            }
            if (engine === "node" && triple.endsWith("-deno")) {
                // skip deno tests in unsupported engines
                continue;
            }
            tasks.push([engine, triple]);
        }
    }
    const failed: string[] = [];

    const runOne = async (cb: () => void) => {
        const t = tasks.pop();
        if (!t) {
            return cb();
        }
        const [engine, triple] = t;
        const ok = await runTestForTriple(engine, triple, testFilters);
        if (!ok) {
            failed.push(`${engine}/${triple}`);
        }
        void runOne(cb);
    };

    const promises = Array.from({ length: navigator.hardwareConcurrency }).map(() => {
        return new Promise<void>((resolve) => runOne(resolve));
    });
    await Promise.all(promises);

    if (failed.length) {
        console.error(`failed: ${failed.join(", ")}`);
        process.exit(1);
    }
    console.log("native tests finished");
};

const runTestForTriple = async (
    engine: Engine,
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
    engine: Engine,
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
                "--allow-net=raw.githubusercontent.com",
                script,
                triple,
                ...testFilters,
            ];
        default:
            throw new Error("unexpected engine: " + engine);
    }
};

void main();
