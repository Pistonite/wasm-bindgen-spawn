import { describe, it, expect } from "mono-dev/vitest";

import { readLogFile } from "#framework";

import { LOG_PATHS, pickValues } from "./util.ts";

describe.each(LOG_PATHS)("%s", (logPath) => {
    const run = readLogFile(logPath);
    const log = run.getTestLog("example_available_parallelism");
    it("is not supported", () => {
        const entries = pickValues(log.entries, "available_parallelism");
        expect(entries).toEqual([true]);
    });
});
