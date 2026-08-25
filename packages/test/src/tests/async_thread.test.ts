import { it, expect } from "mono-dev/vitest";

import { describeLogTest, pickEntries, only, timestampsOf } from "./util.ts";

describeLogTest("example_async_thread", (log) => {
    it("thread1 fetches as expected", () => {
        const entry = only(log.entries, "thread1");
        expect(entry.payload?.thread1).toBe("ok_ok");
        expect(entry.payload?.is_mit_license).toBe(true);
        expect(entry.payload?.bytes).toBe(1088);
    });

    it("thread2 sleeps as expected", () => {
        const entries = pickEntries(log.entries, "thread2");
        expect(entries).toHaveLength(2);
        expect(entries[0].payload?.thread2).toBe("start");
        expect(entries[1].payload?.thread2).toBe("done");
        const [startTimestamp, doneTimestamp] = timestampsOf(entries);
        expect(doneTimestamp - startTimestamp).toBeGreaterThanOrEqual(1000);
    });

    it("did not panic", () => {
        expect(log.panics()).toHaveLength(0);
    });
});
