import child_process from "node:child_process";

import {
    BROWSER_ENGINES,
    type BrowserEngine,
    getPackageRoot,
    parseCommandLineArgs,
} from "#framework";

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

        if (httpOnly) {
            await startHttpServer(useHttps);
            console.log("--http-only: only running http server, kill with ctrl-c");
            return;
        }

        const { skip, one, engines, tripleFilters, testFilters } = parseCommandLineArgs(
            process.argv.slice(2),
            [...BROWSER_ENGINES],
        );
        if (skip) {
            return;
        }

        await startHttpServer(useHttps);
        await startPlaywrightContainer();
        // ensure things are stabilized
        await new Promise((r) => setTimeout(r, 1000));

        if (!httpOnly) {
            let code: number = 1;
            try {
                code = 0;
                for (const engine of engines) {
                    code = await runPlaywright(engine, tripleFilters, one, testFilters);
                    if (code !== 0) {
                        break;
                    }
                }
            } finally {
                // wait for a bit to ensure log files are completely flushed
                // await new Promise((r) => setTimeout(r, 1000));
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

const runPlaywright = async (
    engine: BrowserEngine,
    tripleFilters: string[],
    one: boolean,
    testFilters: string[],
): Promise<number> => {
    const cli = getPlaywrightCli();
    console.log("launching playwright for engine: " + engine);
    return await new Promise<number>((resolve) => {
        const child = child_process.spawn(
            // same node that's running the orchestrator, so the test run can't
            // end up on a different version than the one we're launched with
            process.execPath,
            [cli, "test", `--project=${engine}`],
            {
                stdio: "inherit",
                cwd: getPackageRoot(),
                env: {
                    PW_WBS_TRIPLE_FILTERS: tripleFilters.join(","),
                    PW_WBS_TRIPLE_FILTER_ONE: one ? "1" : "",
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
