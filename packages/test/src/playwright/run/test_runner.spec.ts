import { test, expect, type Page } from '@playwright/test';

// targets to test
const QUADS = [
    "debug-unwind-browser-no-modules"
] as const;

/**
 * How long to wait for the page to reach a terminal state.
 *
 * The wasm tests themselves are the bulk of it, and on top of that the driver
 * worker sleeps 5s at the end to let the fire-and-forget harness POSTs flush
 * (see src/browser/worker_no_modules.js), so this needs plenty of slack -
 * especially for webkit and for the debug builds.
 */
const RUN_TIMEOUT_MS = 150 * 1000;

for (const quad of QUADS) {
    test(quad, async ({ page }) => {
        // the per-test timeout has to outlast the poll, or playwright kills
        // the test before we get to report what the page actually said
        test.setTimeout(RUN_TIMEOUT_MS + 30 * 1000);
        await runTestForQuad(page, quad);
    });
}

const runTestForQuad = async (page: Page, quad: string) => {
    // surface anything the page logs, so a failure here is debuggable
    page.on("console", (msg) => console.log(`[${quad}] ${msg.type()}: ${msg.text()}`));
    page.on("pageerror", (e) => console.log(`[${quad}] pageerror: ${e.message}`));

    await page.goto(`http://localhost:3001/html/${quad}/index.html`);

    // the driver page mirrors the worker's status into this div: "loading...",
    // then "started", then either "done" or an "error..." message
    const out = page.locator('[id="-out-"]');

    // poll until it reaches a terminal state rather than asserting on "done"
    // directly, so an error shows up as its own message instead of as a
    // timeout that says nothing
    await expect
        .poll(() => out.innerText(), { timeout: RUN_TIMEOUT_MS })
        .toMatch(/^(done|error)/);

    const status = await out.innerText();
    expect(status, `harness reported: ${status}`).toBe("done");
};
