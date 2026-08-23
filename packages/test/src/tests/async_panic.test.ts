import { it, expect } from "mono-dev/vitest";

import { describeLogTest, pickEntries, only } from "./util.ts";

describeLogTest("example_async_panic", (log, run) => {
    it("logs 2 panics", () => {
        const panics = log.panics();
        expect(panics).toHaveLength(2);
        // the thread order may be different
        panics.sort((a, b) => a.panic.message.localeCompare(b.panic.message));
        expect(panics[0].panic.message).toBe("test async panic from thread1!");
        expect(panics[1].panic.message).toBe("test async panic from thread2!");
    });

    it("joined thread1 and saw error", () => {
        const entry = only(log.entries, "thread1");
        expect(entry.payload?.thread1).toBe("err");
        if (run.panicRuntime === "abort") {
            expect(entry.payload?.msg).toMatch(/panicked or aborted!/);
        } else {
            expect(entry.payload?.msg).toBe("test async panic from thread1!");
        }
    });

    if (run.isBrowser()) {
        it("joined thread2 and did not observe panic", () => {
            // browsers ignore unhandled rejection
            const entries = pickEntries(log.entries, "thread2");
            expect(entries).toHaveLength(2);
            expect(entries[0].payload).toEqual({ thread2: "finished", finished: true });
            expect(entries[1].payload).toEqual({ thread2: "ok" });
        });
    } else {
        it("did not join thread2", () => {
            // native runtimes kills the worker on unhandled rejection
            // and leaves the join handle hanging
            const entry = only(log.entries, "thread2");
            expect(entry.payload).toEqual({ thread2: "finished", finished: false });
        });
    }
});
