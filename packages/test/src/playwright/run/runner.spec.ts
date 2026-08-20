import { test, expect, type Page } from "@playwright/test";

import { getTargetTestTriples } from "#framework";

const tripleFilters: string[] =
    process.env.PW_WBS_TRIPLE_FILTERS?.split(",")?.map((x) => x.trim()) ?? [];
const testFilters: string[] =
    process.env.PW_WBS_TEST_FILTERS?.split(",")?.map((x) => x.trim()) ?? [];
const triples = getTargetTestTriples(tripleFilters, true /* isBrowser */);

// time wait for 'done' (or error) to be reported from the page
const RUN_TIMEOUT_MS = 150 * 1000;

// make sure we don't run this in vitest
if (!import.meta.vitest) {
    for (const triple of triples) {
        test(triple, async ({ page }, testInfo) => {
            // the per-test timeout has to outlast the poll, or playwright kills
            // the test before we get to report what the page actually said
            test.setTimeout(RUN_TIMEOUT_MS + 30 * 1000);
            // the project name is the browser (firefox/webkit/chrome/msedge) -
            // all projects run the same quads in parallel, so without it the
            // interleaved output is impossible to attribute
            await runTestForQuad(page, triple, testInfo.project.name);
        });
    }
} else {
    const { it } = import.meta.vitest;
    it("(skipping playwright test file)", () => {});
}

const runTestForQuad = async (page: Page, quad: string, browser: string) => {
    // surface anything the page logs, so a failure here is debuggable
    const prefix = `[${browser}/${quad}]`;
    page.on("console", (msg) => console.log(`${prefix}${msg.text()}`));
    page.on("pageerror", (e) => console.log(`${prefix}[pageerror] ${e.message}`));

    if (testFilters.length) {
        await page.goto(
            `http://localhost:3001/html/${quad}/index.html?tests=${testFilters.join(",")}`,
        );
    } else {
        await page.goto(`http://localhost:3001/html/${quad}/index.html`);
    }

    // the driver page mirrors the worker's status into this div: "loading...",
    // then "started", then either "done" or an "error..." message
    const out = page.locator('[id="-out-"]');

    // poll until it reaches a terminal state rather than asserting on "done"
    // directly, so an error shows up as its own message instead of as a
    // timeout that says nothing
    await expect.poll(() => out.innerText(), { timeout: RUN_TIMEOUT_MS }).toMatch(/^(done|error)/);

    const status = await out.innerText();
    expect(status, `harness reported: ${status}`).toBe("done");
};
