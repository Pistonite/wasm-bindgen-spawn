import { expect, it } from "mono-dev/vitest";

import { describeLogTest, only } from "./util.ts";

describeLogTest("example_mutex_poison", (log, run) => {
    it("logged join error", () => {
        const joinError = only(log.entries, "join_error").payload?.join_error;
        if (run.panicRuntime === "abort") {
            expect(joinError).toMatch(/panicked or aborted!/);
        } else {
            expect(joinError).toBe("This is a test panic");
        }
    });
    it("logged a panic", () => {
        const panics = log.entries.filter((x) => x.panic);
        expect(panics.length).toBe(1);
        const e = panics[0];
        expect(e.panic?.message).toBe("This is a test panic");
        expect(e.panic?.file).toBe("/example/src/examples/mutex.rs");
    });
    it("observed the panic from the mutex", () => {
        const tryLockError = only(log.entries, "try_lock").payload?.try_lock;
        if (run.panicRuntime === "abort") {
            expect(tryLockError).toBe("would_block");
        } else {
            expect(tryLockError).toBe("poisoned");
        }
    });
});
