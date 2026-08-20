import path from "node:path";
import fs from "node:fs";

import {
    BROWSER_ENGINES,
    getTargetSubdir,
    NATIVE_ENGINES,
    parseCommandLineArgs,
    readLogFile,
} from "#framework";

// a log dumper

const main = () => {
    const allEngines = [...NATIVE_ENGINES, ...BROWSER_ENGINES];
    const {
        engines: inputEngines,
        tripleFilters,
        testFilters,
    } = parseCommandLineArgs(process.argv.slice(2), allEngines);
    const engines = inputEngines.length ? inputEngines : allEngines;

    const logPaths: string[] = [];
    const shouldRead = (triple: string) => {
        if (tripleFilters.length === 0) {
            return true;
        }
        for (const filter of tripleFilters) {
            if (!triple.includes(filter)) {
                return false;
            }
        }
        return true;
    };
    for (const engine of engines) {
        const engineLogPath = path.join(getTargetSubdir("test"), engine);
        if (!fs.existsSync(engineLogPath)) {
            continue;
        }
        for (const logName of fs.readdirSync(engineLogPath)) {
            if (!shouldRead(logName)) {
                continue;
            }
            logPaths.push(engine + "/" + path.parse(logName).name);
        }
    }

    if (!logPaths.length) {
        console.log("no log matched the filter");
    }

    const shouldPrintTest = (test: string) => {
        if (!testFilters.length) {
            return true;
        }
        return testFilters.some((x: string) => test.includes(x));
    };

    for (const path of logPaths) {
        const log = readLogFile(path);
        console.log(`=== ${path} ===`);
        for (const test in log.tests) {
            if (!shouldPrintTest(test)) {
                continue;
            }
            const testLog = log.tests[test];
            console.log(`[${test}] - ${Math.floor(testLog.duration)}ms`);
            for (const e of testLog.entries) {
                console.log(e.toString());
            }
            console.log();
        }
    }
};

main();
