import { beforeAll, describe, it, expect } from "mono-dev/vitest";

import { readLogFile } from "#framework";


const LOG_PATHS = [
    "node/debug-unwind-node-no-modules.log" 
] as const;

describe.each(LOG_PATHS)("%s", (logPath) => {
    const log = readLogFile(logPath).getTestLog("example_join_handle");
    it("spawned 5 threads", () => {
        const entries = log.entries.filter((x) => x.payload?.spawning_thread);
        expect(entries.length).toBe(5);
        let i = 1;
        for (const e of entries) {
            expect(e.isMainThread()).toBe(true);
            // should spawn in order
            expect(e.payload.spawning_thread).toBe(i);
            i++;
        }
    });


});
