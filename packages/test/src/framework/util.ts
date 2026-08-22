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
export type WasmBundle = WebWasmBundle | NodeWasmBundle | DenoWasmBundle | ViteWasmBundle;

export const PROFILES = ["debug", "release"] as const;
export type Profile = (typeof PROFILES)[number];
export const PANIC_RUNTIMES = ["abort", "unwind"] as const;
export type PanicRuntime = (typeof PANIC_RUNTIMES)[number];
// bun and vite are bundled after the bundler target in wasm-bindgen. bundler is the raw,
// unprocessed output of the bundler target (other than injecting the test harness)
export const TARGETS = ["no-modules", "web", "nodejs", "deno", "bundler", "vite"] as const;
export type Target = (typeof TARGETS)[number];

export const NATIVE_ENGINES = ["node", "bun", "deno"] as const;
export type NativeEngine = (typeof NATIVE_ENGINES)[number];
export const BROWSER_ENGINES = ["firefox", "msedge", "chrome", "webkit"] as const;
export type BrowserEngine = (typeof BROWSER_ENGINES)[number];

export type Engine = NativeEngine | BrowserEngine;

export type Triple = `${Profile}-${PanicRuntime}-${Target}`;

export const getTargetTestTriples = (filters: string[], isBrowser: boolean): Triple[] => {
    const shouldRun = (triple: string): boolean => {
        if (!filters.length) {
            return true;
        }
        for (const filter of filters) {
            if (!triple.includes(filter)) {
                return false;
            }
        }
        return true;
    };
    const triples: Triple[] = [];
    for (const profile of PROFILES) {
        for (const panicRuntime of PANIC_RUNTIMES) {
            for (const target of TARGETS) {
                if (target === "bundler") {
                    // there is no engine yet that will treat `import * as x from "foo.wasm"`
                    // as wasm-instantiation import, bun supports the syntax but
                    // it's an asset
                    continue;
                }
                // nodejs target generates CJS and deno target only works in deno (and bun),
                // skip tests if browser
                if (isBrowser && (target === "nodejs" || target === "deno")) {
                    continue;
                }
                const triple = `${profile}-${panicRuntime}-${target}` as const;
                if (!shouldRun(triple)) {
                    continue;
                }
                triples.push(triple);
            }
        }
    }

    return triples;
};

export const getTestSelection = (testNames: string[], testFilters: string[]): string[] => {
    const engine = getCurrentEngineName();
    const tests = testNames.filter((testCase) => {
        if (engine === "deno") {
            // deno takes 30x more time to spin up 30 workers compared to
            // other engines; skip tests that need to spawn a lot of workers
            if (testCase === "example_arc_atomic") {
                return false;
            }
        }
        if (!testFilters.length) {
            return true;
        }
        return testFilters.some((x) => testCase.includes(x));
    });
    tests.sort();
    return tests;
};

export interface CommandLineArgs<T extends Engine> {
    skip: boolean;
    engines: T[];
    tripleFilters: string[];
    testFilters: string[];
}

export const parseCommandLineArgs = <T extends Engine>(
    args: string[],
    engines: T[],
): CommandLineArgs<T> => {
    const outEngines: T[] = [];
    let tripleFilters: string[] = [];
    const testFilters: string[] = [];
    let one = false;
    let hasUnwantedEngine = false;

    outer: for (const arg of args) {
        for (const e of [...NATIVE_ENGINES, ...BROWSER_ENGINES]) {
            if (arg === "--" + e) {
                if (engines.includes(e as T)) {
                    outEngines.push(e as T);
                    continue outer;
                }
                hasUnwantedEngine = true;
            }
        }
        if (arg.startsWith("-E")) {
            testFilters.push(arg.substring(2));
            continue;
        }
        if (arg === "--") {
            continue;
        }
        if (arg === "-1") {
            one = true;
            continue;
        }
        tripleFilters.push(arg);
    }

    if (one) {
        tripleFilters = ["debug-unwind-no-modules"];
    }

    if (!outEngines.length && hasUnwantedEngine) {
        return {
            skip: true, engines: [], tripleFilters, testFilters
        }
    }

    return {
        skip: false,
        engines: outEngines.length ? outEngines : engines,
        tripleFilters,
        testFilters,
    };
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

export const getTargetDir = () => path.resolve(import.meta.dirname, "../../target");

export const getTargetSubdir = (sub: "test" | "bundle" | "framework") =>
    path.resolve(import.meta.dirname, "../../target", sub);

export const getPackageRoot = () => path.resolve(import.meta.dirname, "../..");
