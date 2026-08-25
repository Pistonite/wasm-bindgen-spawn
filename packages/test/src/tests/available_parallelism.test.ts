import { it, expect } from "mono-dev/vitest";

import { describeLogTest, pickValues } from "./util.ts";

describeLogTest("example_available_parallelism", (log) => {
    it("is not supported", () => {
        const entries = pickValues(log.entries, "available_parallelism");
        expect(entries).toEqual([true]);
    });
});
