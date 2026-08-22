import { expect, it } from "mono-dev/vitest";

import { describeLogTest, pickEntries } from "./util.ts";

describeLogTest("example_arc_atomic_pooled", (log) => {
    it("produced correct pooled result", () => {
        const afterJoin = pickEntries(log.entries, "sum_after_join");
        expect(afterJoin).toHaveLength(1);
        expect(afterJoin[0].isMainThread()).toBe(true);
        expect(afterJoin[0].payload?.sum_after_join).toBe(499500);
    });
});
