import child_process from "node:child_process";
import path from "node:path";

import { getTargetTestQuads, NATIVE_ENGINES, type NativeEngine } from "#framework";

const main = async () => {
    const args = process.argv.slice(2);
    const engines: NativeEngine[] = [];
    const quadsFilter: string[] = [];
    const testFilters: string[] = [];
    for (const arg of args) {
        if (arg === "--node") {
            engines.push("node");
            continue;
        }
        if (arg === "--bun") {
            engines.push("bun");
            continue;
        }
        if (arg === "--deno") {
            engines.push("deno");
            continue;
        }
        if (arg.startsWith("-E")) {
            testFilters.push(arg.substring(2));
            continue;
        }
        quadsFilter.push(arg);
    }
    if (engines.length === 0) {
        engines.push(...NATIVE_ENGINES);
    }

    const quads = getTargetTestQuads(quadsFilter, "node");
    if (!quads.length) {
        console.error("no tests specified");
        process.exit(1);
    }

    const failed: string[] = [];
    // run quad one at a time to avoid overwhelm all cores
    for (const quad of quads) {
        const results = await Promise.all(
            engines.map(
                async (engine) =>
                    [engine, await runTestForQuad(engine, quad, testFilters)] as const,
            ),
        );
        for (const [engine, ok] of results) {
            if (!ok) {
                failed.push(`${engine}/${quad}`);
            }
        }
    }
    if (failed.length) {
        console.error(`failed: ${failed.join(", ")}`);
        process.exit(1);
    }
    console.log("all native tests passed");
};

const runTestForQuad = async (
    engine: NativeEngine,
    quad: string,
    testFilters: string[],
): Promise<boolean> => {
    if (engine === "deno" && quad.endsWith("-nodejs")) {
        // skip nodejs tests in unsupported engines
        return true;
    }
    const script = getDriverScript(quad);
    const [command, ...args] = getEngineCommand(engine, script, quad, testFilters);
    const prefix = `[${engine}/${quad}] `;

    console.log(`running ${engine} ${quad}`);
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

const getDriverScript = (quad: string): string => {
    const DRIVER_DIR = path.resolve(import.meta.dirname, "driver");
    const [profile, panicRuntime, host] = quad.split("-", 3);
    const target = quad.substring(`${profile}-${panicRuntime}-${host}-`.length);
    return path.join(DRIVER_DIR, `${target.replaceAll("-", "_")}.ts`);
};

const getEngineCommand = (
    engine: NativeEngine,
    script: string,
    quad: string,
    testFilters: string[],
): string[] => {
    switch (engine) {
        case "node":
            return ["node", script, quad, ...testFilters];
        case "bun":
            return ["bun", script, quad, ...testFilters];
        case "deno":
            // needs full permissions to read the bundles and write the harness logs
            return ["deno", "-A", script, quad, ...testFilters];
    }
};

void main();
