
import child_process from "node:child_process";
import path from "node:path";

import { PACKAGE_DIR } from "#framework";

import { getPlaywrightVersion } from "./util.ts";

// since playwright needs deps installed on the host that are not easily available
// on all platforms (thanks webkit), we use a docker image to run playwright server.
// the official image doesn't have msedge and chrome which is why we need to build our own
// see docker/Dockerfile

// unique id for the container spawned by the test script
const CONTAINER_NAME = "wbs-test-playwright-container";
const IMAGE_NAME = "wbs-test-playwright";

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
    const image = getImageTag(version);
    const args = [
        "run",
        // need to share network so we can load from localhost which
        // is treated as secure context
        "--network", "host",
        // chromium-family browsers OOM on the default 64MB /dev/shm
        "--ipc", "host",
        "--rm", "--init",
        "--name", CONTAINER_NAME,
        "--workdir", "/home/pwuser",
        "--user", "pwuser",
        image,
        "/bin/sh", "-c",
        // playwright-core is installed globally in the image, so nothing is
        // fetched from npm when the container starts
        `playwright-core run-server --port ${PW_PORT} --host 0.0.0.0`,
    ];

    console.log(`using ${image}`);
    ensureImage(version);
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

export const getImageTag = (version: string): string => {
    return `${IMAGE_NAME}:v${version}-noble`;
}

/**
 * Build the image if it's not already local.
 *
 * Note an edit to the Dockerfile won't be picked up while the tag exists -
 * use `task build-image` to force a rebuild.
 */
const ensureImage = (version: string): void => {
    const image = getImageTag(version);
    const inspect = child_process.spawnSync("docker", ["image", "inspect", image], { stdio: "ignore" });
    if (inspect.status === 0) {
        return;
    }
    buildImage(version);
}

/** force a rebuild, for picking up edits to the Dockerfile */
export const rebuildPlaywrightImage = (): void => {
    buildImage(getPlaywrightVersion());
}

const buildImage = (version: string): void => {
    const image = getImageTag(version);
    console.log(`building container image ${image}`);
    const build = child_process.spawnSync("docker", [
        "build",
        "--build-arg", `PW_VERSION=${version}`,
        "-t", image,
        path.join(PACKAGE_DIR, "docker"),
    ], { stdio: "inherit" });
    if (build.status !== 0) {
        throw new Error(`failed to build ${image}`);
    }
}
