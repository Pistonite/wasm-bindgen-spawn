/// <reference types="node">
import child_process from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

import {
    PANIC_RUNTIMES,
    type PanicRuntime,
    type Profile,
    PROFILES,
    type Target,
    TARGETS,
} from "#framework";

const main = async () => {
    const targetDir = getTargetDir();
    const targetWasmPackLogDir = path.join(targetDir, "wasm-pack", "log");
    if (!fs.existsSync(targetWasmPackLogDir)) {
        fs.mkdirSync(targetWasmPackLogDir, { recursive: true });
    }

    // perform a minimum build, the source contains types
    // from the output which is needed for typechecking
    const minimum = process.argv.includes("--minimum");

    if (!minimum) {
        runFrameworkBuild();
    }

    if (minimum) {
        runCargoBuild("unwind", "debug");
    } else {
        for (const profile of PROFILES) {
            for (const panicRuntime of PANIC_RUNTIMES) {
                runCargoBuild(panicRuntime, profile);
            }
        }
    }

    const output: WasmPackOutput[] = [];
    for (const target of TARGETS) {
        if (isBundleNeededTarget(target)) {
            continue;
        }
        const promises = await Promise.allSettled(
            [
                runWasmPack("unwind", "debug", target),
                !minimum && runWasmPack("unwind", "release", target),
                !minimum && runWasmPack("abort", "debug", target),
                !minimum && runWasmPack("abort", "release", target),
            ].filter(Boolean) as Promise<WasmPackOutput>[],
        );
        for (const p of promises) {
            if (p.status === "rejected") {
                throw p.reason;
            }
            output.push(p.value);
        }
    }

    if (minimum) {
        return;
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
        const bgJsHashKey = `bgjs:${profile}-${panicRuntime}`;
        const bgWasmHashKey = `wasm:${profile}-${panicRuntime}-${isNoWbgModuleTarget(target) ? "no-wbg-module" : "wbg-module"}`;
        const bgWasmDtsHashKey = bgWasmHashKey.replace("wasm:", "wasmdts:");

        const hashKeyPairs = [
            [dtsHashKey, dtsHash],
            [jsHashKey, jsHash],
            [bgWasmHashKey, bgWasmHash],
            [bgWasmDtsHashKey, bgWasmDtsHash],
        ];

        if (!isNoBgJsTarget(target)) {
            hashKeyPairs.push([bgJsHashKey, bgJsHash]);
        }

        for (const [key, hash] of hashKeyPairs) {
            if (!expectedHashs[key]) {
                expectedHashs[key] = hash;
            } else if (expectedHashs[key] !== hash) {
                throw new Error(`unexpected hash mismatch for ${key}`);
            }
        }

        runBundleBuild(panicRuntime, profile, target);
        if (target === "bundler") {
            for (const extraTarget of ["vite"] as const) {
                runBundleBuild(panicRuntime, profile, extraTarget);
            }
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
    return { panicRuntime, profile, target, dtsHash, jsHash, bgJsHash, bgWasmHash, bgWasmDtsHash };
};

const runBundleBuild = (panicRuntime: PanicRuntime, profile: Profile, target: Target) => {
    const triple = `${profile}-${panicRuntime}-${target}`;
    const targetDir = getTargetDir();
    const targetWasmPackDir = path.join(targetDir, "wasm-pack");
    const targetBundleDir = path.join(targetDir, "bundle");
    const outDir = path.join(targetBundleDir, triple);
    const wasmPackOutDir =
        target === "vite"
            ? path.join(targetWasmPackDir, `${profile}-${panicRuntime}-bundler`)
            : path.join(targetWasmPackDir, triple);
    const frameworkOutDir = path.join(targetDir, "framework");

    if (fs.existsSync(outDir)) {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`generating host bundle for ${triple}`);

    const webWasmPackOutDir = path.join(targetWasmPackDir, `${profile}-${panicRuntime}-web`);

    const copyWasmPackOutput = (inFile: string, outFile?: string) => {
        fs.copyFileSync(path.join(wasmPackOutDir, inFile), path.join(outDir, outFile || inFile));
    };
    const copyWebWasmPackOutput = (inFile: string, outFile?: string) => {
        fs.copyFileSync(path.join(webWasmPackOutDir, inFile), path.join(outDir, outFile || inFile));
    };
    const copyFrameworkOutput = (inFile: string, outFile?: string) => {
        fs.copyFileSync(path.join(frameworkOutDir, inFile), path.join(outDir, outFile || inFile));
    };

    switch (target) {
        case "no-modules": {
            copyWasmPackOutput("example.js");
            copyWasmPackOutput("example_bg.wasm");
            copyWasmPackOutput("example.d.ts");
            copyFrameworkOutput("worker.js");
            // create an ESM js that just exports the wasm_bindgen object
            // for easier loading in NodeJS
            const js = fs.readFileSync(path.join(wasmPackOutDir, "example.js"), "utf8");
            fs.writeFileSync(
                path.join(outDir, "example_esm.js"),
                `${js}\nexport default wasm_bindgen;`,
            );
            copyWebWasmPackOutput("example.d.ts", "example_esm.d.ts");
            break;
        }
        case "web": {
            copyWasmPackOutput("example.js");
            copyWasmPackOutput("example_bg.wasm");
            copyWasmPackOutput("example.d.ts");
            copyFrameworkOutput("worker.js");
            break;
        }
        case "nodejs": {
            // wasm-bindgen emits common JS for nodejs target so the extension must be .cjs
            copyWasmPackOutput("example.js", "example.cjs");
            copyWasmPackOutput("example_bg.wasm");
            copyWasmPackOutput("example.d.ts");
            // extra web bindgen script for initializing worker threads
            copyWebWasmPackOutput("example.js", "example_web.js");
            break;
        }
        case "deno": {
            copyWasmPackOutput("example.js");
            copyWasmPackOutput("example_bg.wasm");
            copyWasmPackOutput("example.d.ts");
            // extra web bindgen script for initializing worker threads
            copyWebWasmPackOutput("example.js", "example_web.js");
            break;
        }
        case "bundler": {
            copyWasmPackOutput("example.js");
            copyWasmPackOutput("example_bg.js");
            copyWasmPackOutput("example_bg.wasm");
            copyWasmPackOutput("example.d.ts");
            break;
        }
        case "vite": {
            const viteProjectDir = ensureViteBundleWorkspace(wasmPackOutDir, triple);
            const vitePath = path.join(viteProjectDir, "node_modules", "vite", "bin", "vite.js");
            const result = child_process.spawnSync(process.execPath, [vitePath, "build"], {
                stdio: "inherit",
                cwd: viteProjectDir,
            });
            if (result.status !== 0) {
                throw new Error("vite bundling failed");
            }
            fs.cpSync(path.join(viteProjectDir, "dist"), outDir, { recursive: true });
            copyWasmPackOutput("example.d.ts");
            copyFrameworkOutput("worker.js");
            // extra web bindgen script for initializing worker threads
            copyWebWasmPackOutput("example.js", "example_web.js");
            // the wasm asset might be inlined into the output
            // but we need the bytes for initializing the worker threads
            copyWasmPackOutput("example_bg.wasm");
            break;
        }
    }
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
    child_process.execSync(`bun build ${path.join(sourceDir, "worker.ts")} --outdir=${outDir}`, {
        stdio: "inherit",
    });
};

const ensureViteBundleWorkspace = (wasmPackOutDir: string, triple: string): string => {
    const dir = path.join(getTargetDir(), "bundler-vite");
    const projectDir = path.join(dir, triple);
    if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
    }
    for (const file of ["example.js", "example_bg.js", "example_bg.wasm"]) {
        fs.copyFileSync(path.join(wasmPackOutDir, file), path.join(projectDir, file));
    }
    // read vite and vite-plugin-wasm versions from mono-dev
    const pnpmWorkspaceYaml = `
allowBuilds:
  esbuild: true

packages:
  - '*-vite'

catalog:
  vite: ^8.2.1
  vite-plugin-wasm: ^3.6.0
`;
    const pnpmWorkspaceYamlPath = path.join(dir, "pnpm-workspace.yaml");
    let needPnpmInstall = false;
    if (fs.existsSync(pnpmWorkspaceYamlPath)) {
        const existing = fs.readFileSync(pnpmWorkspaceYamlPath, "utf-8");
        if (existing !== pnpmWorkspaceYaml) {
            console.log("[bundler-vite] overwriting old pnpm-workspace.yaml");
            fs.writeFileSync(pnpmWorkspaceYamlPath, pnpmWorkspaceYaml);
            needPnpmInstall = true;
        }
    } else {
        fs.writeFileSync(pnpmWorkspaceYamlPath, pnpmWorkspaceYaml);
        needPnpmInstall = true;
    }

    const packageJsonPath = path.join(projectDir, "package.json");
    const packageJson = JSON.stringify(
        {
            name: triple,
            version: "0.0.0",
            type: "module",
            private: true,
            devDependencies: {
                vite: "catalog:",
                "vite-plugin-wasm": "catalog:",
            },
        },
        undefined,
        4,
    );
    if (fs.existsSync(packageJsonPath)) {
        const existing = fs.readFileSync(packageJsonPath, "utf-8");
        if (existing !== packageJson) {
            console.log("[bundler-vite] overwriting old package.json for quad " + triple);
            fs.writeFileSync(packageJsonPath, packageJson);
            needPnpmInstall = true;
        }
    } else {
        fs.writeFileSync(packageJsonPath, packageJson);
        needPnpmInstall = true;
    }

    if (!needPnpmInstall && !fs.existsSync(path.join(projectDir, "node_modules"))) {
        needPnpmInstall = true;
    }
    if (needPnpmInstall) {
        child_process.execSync("pnpm install", {
            stdio: "inherit",
            cwd: dir,
        });
    }

    const viteConfigJs = `
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

export default defineConfig({
    plugins: [wasm()],
    build: {
        lib: {
            entry: "example.js",
            formats: ["es"],
            fileName: "example",
        },
        rolldownOptions: {
            external: ["node:fs"]
        }
    },
});
`;
    fs.writeFileSync(path.join(projectDir, "vite.config.js"), viteConfigJs);

    return projectDir;
};

const getCargoProjectDir = (panicRuntime: PanicRuntime): string => {
    return path.resolve(import.meta.dirname, `../../build-${panicRuntime}`);
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
    return target !== "bundler";
};

// targets that need to be bundled from the bundler target
const isBundleNeededTarget = (target: Target) => {
    return target === "vite";
};

void main();
