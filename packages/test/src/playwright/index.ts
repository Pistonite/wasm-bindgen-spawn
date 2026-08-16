import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { BROWSER_ENGINES, type BrowserEngine, getPackageRoot, getTargetSubdir, getTargetTestQuads } from "#framework";

import { startHttpServer, stopHttpServer } from "./http_server.ts";
import {
    PW_PORT,
    rebuildPlaywrightImage,
    startPlaywrightContainer,
    stopPlaywrightContainer,
} from "./pw_container.ts";
import { getPlaywrightCli } from "./util.ts";

const main = async () => {
    try {
        // nothing to start up or tear down for this one
        if (process.argv.includes("--build-image")) {
            rebuildPlaywrightImage();
            return;
        }

        // register clean up on ctrl-c
        for (const signal of ["SIGINT", "SIGTERM"] as const) {
            process.on(signal, async () => {
                console.log("interrupted! terminating the orchestrator");
                await cleanup();
                process.exit(130);
            });
        }

        const httpOnly = process.argv.includes("--http-only");
        const useHttps = process.argv.includes("--https");
        if (useHttps && !httpOnly) {
            throw new Error("--https may only be used with --http-only");
        }

        await startHttpServer(useHttps);
        if (httpOnly) {
            console.log("--http-only: only running http server, kill with ctrl-c");
            return;
        }

        await startPlaywrightContainer();
        // ensure things are stabilized
        await new Promise((r) => setTimeout(r, 1000));

        const engines: BrowserEngine[] = []
        const quadsFilter: string[] = [];
        const testFilters: string[] = [];
        outer: for (const arg of process.argv.slice(2)) {
            for (const e of BROWSER_ENGINES) {
                if (arg === "--" + e) {
                    engines.push(e);
                    continue outer;
                }
            }
            if (arg.startsWith("-E")) {
                testFilters.push(arg.substring(2));
                continue;
            }
            quadsFilter.push(arg);
        }

        // clean the browser test outputs
        for (const engine of (engines.length ? engines : BROWSER_ENGINES)) {
            const dir = path.join(getTargetSubdir("test"), engine);
            fs.mkdirSync(dir, { recursive: true });
            const quads = getTargetTestQuads(quadsFilter, "browser");
            for (const quad of quads) {
                fs.rmSync(path.join(dir, quad + ".log"), { force: true });
            }
        }


        if (!httpOnly) {
            let code: number;
            try {
                code = await runPlaywright(engines, quadsFilter, testFilters);
            } finally {
                console.log("waiting for log flushing to complete");
                // wait for a bit to ensure log files are completely flushed
                await new Promise((r) => setTimeout(r, 5000));
                await cleanup();
            }

            process.exit(code);
        } else {
            console.log("--http-only: only running http server, kill with ctrl-c");
        }
    } catch (e) {
        console.error(e);
        await cleanup();
        console.error("fatal error occured, unable to run test");
        process.exit(1);
    }
};

const runPlaywright = async (engines: BrowserEngine[], quadsFilter: string[], testFilters: string[]): Promise<number> => {
    const cli = getPlaywrightCli();
    console.log("launching playwright");
    const engineFlags = engines.map((e) => `--project=${e}`);
    return await new Promise<number>((resolve) => {
        const child = child_process.spawn(
            // same node that's running the orchestrator, so the test run can't
            // end up on a different version than the one we're launched with
            process.execPath,
            [cli, "test", ...engineFlags],
            {
                stdio: "inherit",
                cwd: getPackageRoot(),
                env: {
                    PW_WBS_QUAD_FILTERS: quadsFilter.join(","),
                    PW_WBS_TEST_FILTERS: testFilters.join(","),
                    PW_TEST_CONNECT_WS_ENDPOINT: `ws://localhost:${PW_PORT}`,
                },
            },
        );
        child.on("error", (e) => {
            console.error("failed to run playwright:", e);
            resolve(1);
        });
        child.on("close", (code) => resolve(code ?? 1));
    });
};

const cleanup = async () => {
    await Promise.all([stopHttpServer(), stopPlaywrightContainer()]);
};

void main();
