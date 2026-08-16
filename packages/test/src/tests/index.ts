import { readLogFile } from "#framework";

// a log dumper

const main = () => {
    const [_exe, _src, ...paths] = process.argv;
    for (const path of paths) {
        const log = readLogFile(path);
        console.log(`=== ${path} (${log.panicRuntime}) ===`);
        for (const test in log.testLogMap) {
            const testLog = log.testLogMap[test];
            console.log(`[${test}] - ${Math.floor(testLog.duration)}ms`);
            for (const e of testLog.entries) {
                console.log(e.toString());
            }
            console.log();
        }
    }
}

main();
