import child_process from "node:child_process";
import path from "node:path";

import { NATIVE_ENGINES, type NativeEngine, PANIC_RUNTIMES, PROFILES } from "#framework";

const QUADS: string[] = [];
for (const profile of PROFILES) {
    for (const panicRuntime of PANIC_RUNTIMES) {
        for (const target of ["no-modules"]) {
            QUADS.push(`${profile}-${panicRuntime}-node-${target}`);
        }
    }
}

const DRIVER_DIR = path.resolve(import.meta.dirname, "driver");

const main = async () => {
    const failed: string[] = [];
    // quads run one at a time, but the engines run against each quad together -
    // they write to separate log dirs so there's nothing to race over
    for (const quad of QUADS) {
        const results = await Promise.all(
            NATIVE_ENGINES.map(
                async (engine) => [engine, await runTestForQuad(engine, quad)] as const,
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

const runTestForQuad = async (engine: NativeEngine, quad: string): Promise<boolean> => {
    const script = getDriverScript(quad);
    const [command, ...args] = getEngineCommand(engine, script, quad);
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
    const [profile, panicRuntime, host] = quad.split("-", 3);
    const target = quad.substring(`${profile}-${panicRuntime}-${host}-`.length);
    return path.join(DRIVER_DIR, `${target.replaceAll("-", "_")}.ts`);
};

const getEngineCommand = (engine: NativeEngine, script: string, quad: string): string[] => {
    switch (engine) {
        case "node":
            return ["node", script, quad];
        case "bun":
            return ["bun", script, quad];
        case "deno":
            // needs full permissions to read the bundles and write the harness logs
            return ["deno", "-A", script, quad];
    }
};

void main();
