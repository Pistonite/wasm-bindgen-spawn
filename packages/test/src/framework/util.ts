import path from "node:path";

// we use the web wasm bundle's typing for no modules since no-modules isn't ESM
export type NoModulesWasmBundle = WebWasmBundle;
export type WebWasmBundle =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    typeof import("../../target/wasm-pack/debug-unwind-web/example.js");
export type NodeWasmBundle =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    typeof import("../../target/wasm-pack/debug-unwind-nodejs/example.js");
export type DenoWasmBundle =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    typeof import("../../target/wasm-pack/debug-unwind-deno/example.js");
export type ViteWasmBundle =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    typeof import("../../target/wasm-pack/debug-unwind-bundler/example.js");

export const PROFILES = ["debug", "release"] as const;
export type Profile = (typeof PROFILES)[number];
export const PANIC_RUNTIMES = ["abort", "unwind"] as const;
export type PanicRuntime = (typeof PANIC_RUNTIMES)[number];
// bun and vite are bundled after the bundler target in wasm-bindgen. bundler is the raw,
// unprocessed output of the bundler target (other than injecting the test harness)
export const TARGETS = ["no-modules", "web", "nodejs", "deno", "bundler", "vite"] as const;
export type Target = (typeof TARGETS)[number];
// hosts should really be "native" and "browser" but too late to change it now
// node also kind of make sense because the test harness uses node:fs
export const HOSTS = ["node", "browser"] as const;
export type Host = (typeof HOSTS)[number];

export const NATIVE_ENGINES = ["node", "bun", "deno"] as const;
export type NativeEngine = (typeof NATIVE_ENGINES)[number];
export const BROWSER_ENGINES = ["firefox", "msedge", "chrome", "webkit"] as const;
export type BrowserEngine = (typeof BROWSER_ENGINES)[number];

export type Engine = NativeEngine | BrowserEngine;

export const getTargetTestQuads = (filters: string[], host: Host): string[] => {
    const shouldRun = (triple: string): boolean => {
        if (!filters.length) {
            return true;
        }
        for (const filter of filters) {
            if (triple.includes(filter)) {
                return true;
            }
        }
        return false;
    };
    const quads: string[] = [];
    for (const profile of PROFILES) {
        for (const panicRuntime of PANIC_RUNTIMES) {
            for (const target of TARGETS) {
                if (target === "bundler") {
                    // there is no engine yet that will treat `import * as x from "foo.wasm"`
                    // as wasm-instantiation import, bun supports the syntax but
                    // it's an asset
                    continue;
                }
                const triple = `${profile}-${panicRuntime}-${target}`;
                if ((target === "nodejs" || target === "deno") && host === "browser") {
                    continue;
                }
                if (shouldRun(triple)) {
                    const quad = `${profile}-${panicRuntime}-${host}-${target}`;
                    quads.push(quad);
                }
            }
        }
    }

    return quads;
};

export const getCurrentEngineName = (): Engine => {
    try {
        const ua = navigator.userAgent;
        return getEngineNameFromUserAgent(ua);
    } catch {
        // ignore if we can't determine with UA
    }
    // try some magic
    // @ts-expect-error Deno global
    if (typeof Deno !== "undefined") {
        return "deno";
    }
    if (typeof process !== "undefined") {
        if (process.release.sourceUrl?.includes("/bun")) {
            return "bun";
        }
        return "node";
    }
    throw new Error("what the heck are we running in??");
};

export const getEngineNameFromUserAgent = (ua: string): Engine => {
    if (ua.startsWith("Node/")) {
        return "node";
    }
    if (ua.startsWith("Bun/")) {
        return "bun";
    }
    if (ua.startsWith("Deno/")) {
        return "deno";
    }
    if (ua.includes("Firefox/")) {
        return "firefox";
    }
    if (ua.includes("Edg/")) {
        return "msedge";
    }
    if (ua.includes("Chrome/")) {
        return "chrome";
    }
    if (ua.toLowerCase().includes("macintosh") || ua.toLowerCase().includes("iphone")) {
        return "webkit";
    }
    throw new Error("what the heck are we running in??");
};

export const measure = (name: string, f: () => void) => {
    const start = performance.now();
    console.log(`[test ${name}] start >>`);
    f();
    const elapsed = Math.floor(performance.now() - start);
    console.log(`[test ${name}] << done ${elapsed}ms`);
};

export const getTargetSubdir = (sub: "test" | "bundle" | "framework") =>
    path.resolve(import.meta.dirname, "../../target", sub);

export const getPackageRoot = () => path.resolve(import.meta.dirname, "../..");
