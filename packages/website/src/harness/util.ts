export type PanicRuntime = "unwind" | "abort";
export const GITHUB_LINK = "https://github.com/Pistonite/wasm-bindgen-spawn";
export const timestampNow = () => {
    return performance.now() + performance.timeOrigin;
};
