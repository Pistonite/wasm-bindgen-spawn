
import child_process from "node:child_process";

import { getPlaywrightVersion } from "./util.ts";

// since playwright needs deps installed on the host that are not easily available
// on all platforms (thanks webkit), we use the official docker image to run playwright
// server

// unique id for the container spawned by the test script
const CONTAINER_NAME = "wbs-test-playwright-container";

// the websocket port that will open by the container
export const PW_PORT = 3000;

let instance: child_process.ChildProcess | undefined;
let closed = false;

export const stopPlaywrightContainer = () => {
    if (closed) {
        return;
    }
    try {
        closed = true;
        console.log("shutting down playwright container");
        if (instance) {
            instance.kill("SIGTERM");
        }
    }catch(e) {
        console.error(e);
    }
}

export const startPlaywrightContainer = async (): Promise<void> => {
    const version = getPlaywrightVersion();

    // if a previous run was killed hard, the container may still be around
    child_process.spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });

    // see https://playwright.dev/docs/docker
    const image = `mcr.microsoft.com/playwright:v${version}-noble`;
    const args = [
        "run",
        // need to share network so we can load from localhost which
        // is treated as secure context
        "--network", "host",
        "--rm", "--init",
        "--name", CONTAINER_NAME,
        "--workdir", "/home/pwuser",
        "--user", "pwuser",
        image,
        "/bin/sh", "-c",
        `npx -y playwright@${version} run-server --port ${PW_PORT} --host 0.0.0.0`,
    ];

    console.log(`using ${image}`);
    ensureImage(image);
    const child = child_process.spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });

    await new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            fn();
        };
        const timer = setTimeout(() => {
            settle(() => reject(new Error("timed out waiting for the playwright server to start")));
        }, 30000);

        const onData = (chunk: Buffer) => {
            const text = chunk.toString("utf8");
            const linesPrefixed = text.replace(/^(?!$)/gm, "[pw-server] ");
            process.stdout.write(linesPrefixed);
            if (text.includes("Listening on ws://")) {
                settle(resolve);
            }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", (e) => settle(() => reject(e)));
        child.on("close", (exitCode) => {
            settle(() => reject(new Error(`playwright server exited early with code ${exitCode}`)));
        });
    });

    instance = child;
    console.log("playwright server ready");
}

/**
 * Pull the image if it's not already local.
 */
const ensureImage = (image: string): void => {
    const inspect = child_process.spawnSync("docker", ["image", "inspect", image], { stdio: "ignore" });
    if (inspect.status === 0) {
        return;
    }
    const pull = child_process.spawnSync("docker", ["pull", image], { stdio: "inherit" });
    if (pull.status !== 0) {
        throw new Error(`failed to pull ${image}`);
    }
}
