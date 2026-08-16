import { BROWSER_ENGINES, NATIVE_ENGINES, PANIC_RUNTIMES, PROFILES } from "#framework";

export const LOG_PATHS: string[] = [];
for (const profile of PROFILES) {
    for (const panicRuntime of PANIC_RUNTIMES) {
        for (const target of ["no-modules"]) {
            for (const engine of BROWSER_ENGINES) {
                LOG_PATHS.push(`${engine}/${profile}-${panicRuntime}-browser-${target}.log`);
            }
            for (const engine of NATIVE_ENGINES) {
                LOG_PATHS.push(`${engine}/${profile}-${panicRuntime}-node-${target}.log`);
            }
        }
    }
}
