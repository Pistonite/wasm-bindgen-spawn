import path from "node:path";

export type NoModulesWasmBundle =
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    typeof import("../../target/bundle/debug-unwind-node-no-modules/example_esm.js");

export const PROFILES = ["debug", "release"] as const;
export type Profile = (typeof PROFILES)[number];
export const PANIC_RUNTIMES = [/*"abort", */ "unwind"] as const;
export type PanicRuntime = (typeof PANIC_RUNTIMES)[number];
export const TARGETS = ["no-modules", "web", "nodejs", "deno", "bundler"] as const;
export type Target = (typeof TARGETS)[number];
export const HOSTS = ["node", "browser"] as const;
export type Host = (typeof HOSTS)[number];

export const NATIVE_ENGINES = ["node", "bun", "deno"] as const;
export type NativeEngine = (typeof NATIVE_ENGINES)[number];
export const BROWSER_ENGINES = ["firefox", "msedge", "chrome", "webkit"] as const;
export type BrowserEngine = (typeof BROWSER_ENGINES)[number];

export type Engine = NativeEngine | BrowserEngine;

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
    console.log(`${name} - start`);
    f();
    const elapsed = Math.floor(performance.now() - start);
    console.log(`${name} - ${elapsed}ms`);
};

export const getTargetSubdir = (sub: "test" | "bundle" | "framework") =>
    path.resolve(import.meta.dirname, "../../target", sub);

export const getPackageRoot = () => path.resolve(import.meta.dirname, "../..");
