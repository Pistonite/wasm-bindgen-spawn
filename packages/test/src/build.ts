/// <reference types="node">
import child_process from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

import { type Host, HOSTS, type PanicRuntime, type Profile, type Target } from "#framework";

const main = async () => {
    const targetDir = getTargetDir();
    const targetWasmPackLogDir = path.join(targetDir, "wasm-pack", "log");
    if (!fs.existsSync(targetWasmPackLogDir)) {
        fs.mkdirSync(targetWasmPackLogDir, { recursive: true });
    }

    runFrameworkBuild();

    runCargoBuild("unwind", "debug");
    runCargoBuild("unwind", "release");
    const promises = await Promise.allSettled([
        runWasmPack("unwind", "debug", "no-modules"),
        runWasmPack("unwind", "debug", "web"),
        runWasmPack("unwind", "release", "no-modules"),
        runWasmPack("unwind", "release", "web"),
    ]);
    const output: WasmPackOutput[] = [];
    for (const p of promises) {
        if (p.status === "rejected") {
            throw p.reason;
        }
        output.push(p.value);
    }

    const expectedHashs: Record<string, string> = {};
    for (const wasmPack of output) {
        const {
            profile,
            panicRuntime,
            target,
            dtsHash,
            jsHash,
            bgJsHash,
            bgWasmHash,
            bgWasmDtsHash,
        } = wasmPack;
        const triple = `${profile}-${panicRuntime}-${target}`;
        // the wbg symbol hashes are different based on profile
        const dtsHashKey = `dts:${profile}-${panicRuntime}-${target}`;
        const jsHashKey = `js:${profile}-${panicRuntime}-${target}`;
        if (isNoBgJsTarget(target)) {
            if (bgJsHash !== "") {
                throw new Error(`unexpected _bg.js found for ${triple}`);
            }
        }
        // const bgJsHashKey = `bgjs:${}`;
        const bgWasmHashKey = `wasm:${profile}-${panicRuntime}-${isNoWbgModuleTarget(target) ? "no-wbg-module" : "wbg-module"}`;
        const bgWasmDtsHashKey = bgWasmHashKey.replace("wasm:", "wasmdts:");

        const hashKeyPairs = [
            [dtsHashKey, dtsHash],
            [jsHashKey, jsHash],
            [bgWasmHashKey, bgWasmHash],
            [bgWasmDtsHashKey, bgWasmDtsHash],
        ];

        for (const [key, hash] of hashKeyPairs) {
            if (!expectedHashs[key]) {
                expectedHashs[key] = hash;
            } else if (expectedHashs[key] !== hash) {
                throw new Error(`unexpected hash mismatch for ${key}`);
            }
        }

        for (const host of HOSTS) {
            runPostBuild(panicRuntime, profile, target, host);
        }
    }
};

const runCargoBuild = (panicRuntime: PanicRuntime, profile: Profile) => {
    const flag = profile === "release" ? "--release" : "";
    const dir = getCargoProjectDir(panicRuntime);
    child_process.execSync(`cargo build ${flag} --target wasm32-unknown-unknown`, {
        stdio: "inherit",
        cwd: dir,
    });
};

interface WasmPackOutput {
    panicRuntime: PanicRuntime;
    profile: Profile;
    target: Target;
    dtsHash: string;
    jsHash: string;
    bgJsHash: string;
    bgWasmHash: string;
    bgWasmDtsHash: string;
}
const runWasmPack = async (
    panicRuntime: PanicRuntime,
    profile: Profile,
    target: Target,
): Promise<WasmPackOutput> => {
    const dir = getCargoProjectDir(panicRuntime);
    const targetWasmPackDir = path.join(getTargetDir(), "wasm-pack");
    const triple = `${profile}-${panicRuntime}-${target}`;
    const outDir = path.join(targetWasmPackDir, triple);
    const logDir = path.join(targetWasmPackDir, "log");
    const stdoutFile = fs.createWriteStream(path.join(logDir, triple + ".out"));
    const stderrFile = fs.createWriteStream(path.join(logDir, triple + ".err"));

    console.log(`building wasm-pack ${triple}`);

    if (fs.existsSync(outDir)) {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
    const command = [
        "build",
        "-t",
        target,
        "--no-gitignore",
        "--no-pack",
        profile === "release" ? "--release" : "--dev",
        "--out-dir",
        path.join(targetWasmPackDir, triple),
        "--out-name",
        "example",
        "--",
    ];
    if (isNoWbgModuleTarget(target)) {
        command.push("--features", "no-wbg-module");
    }

    await new Promise<void>((resolve, reject) => {
        const child = child_process.spawn("wasm-pack", command, {
            stdio: ["ignore", "pipe", "pipe"],
            cwd: dir,
        });
        child.stdout.pipe(stdoutFile);
        child.stderr.pipe(stderrFile);
        child.on("error", reject);
        child.on("close", (code) => {
            stdoutFile.end();
            stderrFile.end();
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`wasm-pack failed with exit code ${code}`));
            }
        });
    });

    const dtsHash = getFileHashIfExists(path.join(outDir, "example.d.ts"));
    const jsHash = getFileHashIfExists(path.join(outDir, "example.js"));
    const bgJsHash = getFileHashIfExists(path.join(outDir, "example_bg.js"));
    const bgWasmHash = getFileHashIfExists(path.join(outDir, "example_bg.wasm"));
    const bgWasmDtsHash = getFileHashIfExists(path.join(outDir, "example_bg.wasm.d.ts"));
    console.log(`done ${triple}`);
    return { panicRuntime, profile, target, dtsHash, jsHash, bgJsHash, bgWasmHash, bgWasmDtsHash };
};

const runPostBuild = (panicRuntime: PanicRuntime, profile: Profile, target: Target, host: Host) => {
    const triple = `${profile}-${panicRuntime}-${target}`;
    const quad = `${profile}-${panicRuntime}-${host}-${target}`;
    const targetDir = getTargetDir();
    const targetWasmPackDir = path.join(targetDir, "wasm-pack");
    const targetBundleDir = path.join(targetDir, "bundle");
    const outDir = path.join(targetBundleDir, quad);
    const wasmPackOutDir = path.join(targetWasmPackDir, triple);
    const frameworkOutDir = path.join(targetDir, "framework");

    if (fs.existsSync(outDir)) {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`generating host bundle for ${quad}`);

    fs.copyFileSync(path.join(wasmPackOutDir, "example.d.ts"), path.join(outDir, "example.d.ts"));
    switch (target) {
        case "no-modules": {
            if (host === "node") {
                const js = fs.readFileSync(path.join(wasmPackOutDir, "example.js"), "utf8");
                fs.writeFileSync(
                    path.join(outDir, "example.js"),
                    `import fs from "node:fs";globalThis.__fs=fs;\n${js}`,
                );
                fs.writeFileSync(
                    path.join(outDir, "example_esm.js"),
                    `import fs from "node:fs";globalThis.__fs=fs;\n${js}\nexport default wasm_bindgen;`,
                );
                fs.copyFileSync(
                    path.join(targetWasmPackDir, `${profile}-${panicRuntime}-web`, "example.d.ts"),
                    path.join(outDir, "example_esm.d.ts"),
                );
            } else {
                fs.copyFileSync(
                    path.join(wasmPackOutDir, "example.js"),
                    path.join(outDir, "example.js"),
                );
                fs.copyFileSync(
                    path.join(frameworkOutDir, "worker_no_modules.js"),
                    path.join(outDir, "worker.js"),
                );
            }
            break;
        }
        case "web": {
            if (host === "node") {
                const js = fs.readFileSync(path.join(wasmPackOutDir, "example.js"), "utf8");
                fs.writeFileSync(path.join(outDir, "example.js"), `import fs from "fs";\n${js}`);
            } else {
                fs.copyFileSync(
                    path.join(wasmPackOutDir, "example.js"),
                    path.join(outDir, "example.js"),
                );
            }
            break;
        }
    }
    fs.copyFileSync(
        path.join(wasmPackOutDir, "example_bg.wasm"),
        path.join(outDir, "example_bg.wasm"),
    );
};

const runFrameworkBuild = () => {
    // build the frontend driver website that will test the wasm in browsers using playwright
    const sourceDir = path.resolve(import.meta.dirname, "playwright", "driver");
    const sourceIndexHtml = path.join(sourceDir, "index.html");
    if (sourceIndexHtml.includes(" ")) {
        throw new Error("project path cannot contain spaces");
    }
    const targetDir = getTargetDir();
    const outDir = path.join(targetDir, "framework");
    child_process.execSync(
        `bun build --compile --target=browser ${sourceIndexHtml} --outdir=${outDir}`,
        {
            stdio: "inherit",
        },
    );
    child_process.execSync(
        `bun build ${path.join(sourceDir, "worker_no_modules.ts")} --outdir=${outDir}`,
        {
            stdio: "inherit",
        },
    );
};

const getCargoProjectDir = (panicRuntime: PanicRuntime): string => {
    return path.resolve(import.meta.dirname, `../build-${panicRuntime}`);
};

const getTargetDir = (): string => {
    return path.resolve(import.meta.dirname, "../target");
};

const getFileHashIfExists = (path: string): string => {
    if (!fs.existsSync(path)) {
        return "";
    }
    const bytes = fs.readFileSync(path);
    return crypto.createHash("sha256").update(bytes).digest("hex");
};

const isNoWbgModuleTarget = (target: Target) => {
    return target === "deno" || target === "bundler";
};

const isNoBgJsTarget = (target: Target) => {
    return target === "no-modules" || target === "web";
};

void main();
