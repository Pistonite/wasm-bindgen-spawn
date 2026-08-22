import child_process from "node:child_process";
import path from "node:path";

import { BROWSER_ENGINES, type Engine, getPackageRoot, NATIVE_ENGINES, PANIC_RUNTIMES, parseCommandLineArgs, PROFILES, type Triple } from "#framework";

const main = () => {
    const { skip, engines, tripleFilters, testFilters } = parseCommandLineArgs(
        process.argv.slice(2),
        [...NATIVE_ENGINES, ...BROWSER_ENGINES],
    );
    if (skip) {
        return;
    }
    const engineSet = new Set(engines);
    const logPaths: string[] = [];
    const pushLogPath = (engine: Engine, triple: Triple) => {
        if (!engineSet.has(engine)) {
            return;
        }
        if (tripleFilters.length) {
            for (const filter of tripleFilters) {
                if (!triple.includes(filter)) {
                    return;
                }
            }
        }
        logPaths.push(`${engine}/${triple}`);
    };
    for (const profile of PROFILES) {
        for (const panicRuntime of PANIC_RUNTIMES) {
            for (const target of ["no-modules", "web", "vite"] as const) {
                for (const engine of BROWSER_ENGINES) {
                    pushLogPath(engine, `${profile}-${panicRuntime}-${target}`);
                }
                for (const engine of NATIVE_ENGINES) {
                    // bun v1.3.14 currently has a bug where it seg faults when trying to grow shared memory
                    if (engine === "bun") {
                        continue;
                    }
                    pushLogPath(engine, `${profile}-${panicRuntime}-${target}`);
                }
            }
            // nodejs target
            for (const engine of ["node", "bun"] as const) {
                // bun v1.3.14 currently has a bug where it seg faults when trying to grow shared memory
                if (engine === "bun") {
                    continue;
                }
                pushLogPath(engine, `${profile}-${panicRuntime}-nodejs`);
            }
            // deno target
            for (const engine of ["bun", "deno"] as const) {
                // bun v1.3.14 currently has a bug where it seg faults when trying to grow shared memory
                if (engine === "bun") {
                    continue;
                }
                pushLogPath(engine, `${profile}-${panicRuntime}-deno`);
            }
        }
    }

    if (!logPaths.length) {
        console.log("no test to run matching the filters");
        return;
    }

    const root = getPackageRoot();
    const vitestPath = path.join(root, "node_modules", "mono-dev", "bin", "vitest.js");

    const result = child_process.spawnSync(process.execPath, [vitestPath, "run", ...testFilters], {
        stdio: "inherit",
        cwd: root,
        env: {
            PATH: process.env.PATH,
            WBS_VITEST_INPUTS: logPaths.join(","),
            WBS_VITEST_TEST_FILTERS: testFilters.join(",")
        }
    });
    if (result.error) {
        throw result.error;
    }
    process.exit(result.status);
}

main();
