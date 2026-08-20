import { describe, it, expect } from "mono-dev/vitest";

import { readLogFile } from "#framework";

import { LOG_PATHS } from "./util.ts";

describe.each(LOG_PATHS)("%s", (logPath) => {
    const run = readLogFile(logPath);
    const log = run.getTestLog("example_join_handle");
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
    it("got output from threads", () => {
        const startEntries = log.entries.filter((x) => x.payload?.thread_start);
        expect(startEntries.length).toBe(5);
        const returnEntries = log.entries.filter(
            (x) => x.payload?.thread_panic || x.payload?.thread_return,
        );
        expect(returnEntries.length).toBe(5);
        let value = 1;
        for (const e of returnEntries) {
            // each thread multiplies the input by 3;
            const expectedValue = value * 3;
            if (expectedValue === 6) {
                if (run.panicRuntime === "unwind") {
                    expect(e.payload.thread_panic).toBe("hey, I'm 2 (this is a test panic)");
                } else {
                    expect(e.payload.thread_panic).toMatch(/panicked or aborted!/);
                }
            } else {
                expect(e.payload.thread_return).toBe(expectedValue);
            }
            value++;
        }
    });
    it("panic information", () => {
        const panicEntries = log.entries.filter((x) => x.panic);
        expect(panicEntries.length).toBe(1);
        const e = panicEntries[0];
        // the panic message is from the Rust's panic runtime which triggers
        // in both abort and unwind so we will get the actual message regardless
        expect(e.panic?.message).toBe("hey, I'm 2 (this is a test panic)");
        expect(e.panic?.file).toBe("/example/src/examples/basic.rs");
    });
});
