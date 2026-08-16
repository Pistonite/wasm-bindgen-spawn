/// <reference types="node">
import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: "./src/playwright/run",
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: undefined,
    reporter: "list",
    /* the real test output is the harness logs under target/test, so there's
     * nothing here worth keeping around */
    outputDir: "./target/playwright",
    preserveOutput: "never",
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        // Base URL to use in actions like `await page.goto('')`
        // this is the http server that serves the front end test bundles (see playwright/http_server.ts)
        baseURL: "http://localhost:3001",

        /* nothing to attach - a failure here means the page never reached "done",
         * and why it didn't is in the harness log, not in a trace */
        trace: "off",
        screenshot: "off",
        video: "off",
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
        },
        {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
        },
        {
            name: "msedge",
            use: { ...devices["Desktop Edge"], channel: "msedge" },
        },
        {
            name: "chrome", // google chrome
            use: { ...devices["Desktop Chrome"], channel: "chrome" },
        },
    ],
});
