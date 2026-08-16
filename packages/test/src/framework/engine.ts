
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
    if (typeof process !== 'undefined') {
        if (process.release.sourceUrl?.includes("/bun")) {
            return "bun";
        }
        return "node";
    }
    throw new Error("what the heck are we running in??");
}

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
}
