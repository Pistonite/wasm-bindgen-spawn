import fs from "node:fs";
import path from "node:path";

import { getPackageRoot } from "#framework";

/** resolve the playwright cli script from the installed package's bin entry */
export const getPlaywrightCli = (): string => {
    const packageDir = getPlaywrightPackageDir();
    const { bin } = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
    const entry = typeof bin === "string" ? bin : bin?.playwright;
    if (typeof entry !== "string") {
        throw new Error(`could not find the playwright bin entry in ${packageDir}`);
    }
    const cli = path.join(packageDir, entry);
    if (!fs.existsSync(cli)) {
        throw new Error(`playwright cli not found at ${cli}`);
    }
    return cli;
};

/** read the playwright version from node_modules so we can target the same version for the docker image */
export const getPlaywrightVersion = (): string => {
    const packageJsonPath = path.join(getPlaywrightPackageDir(), "package.json");
    const { version } = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (typeof version !== "string") {
        throw new Error(`could not read the playwright version from ${packageJsonPath}`);
    }
    // the version is interpolated into the `/bin/sh -c` string passed to docker,
    // so anything outside this alphabet could break out of the command
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(version)) {
        throw new Error(`unexpected playwright version format in ${packageJsonPath}: ${version}`);
    }
    return version;
};

const getPlaywrightPackageDir = (): string => {
    return path.join(getPackageRoot(), "node_modules", "@playwright", "test");
};
