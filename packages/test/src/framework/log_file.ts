import fs from "node:fs";
import path from "node:path";

import { getTargetSubdir, type Engine } from "./util.ts";

export const readLogFile = (engineLogName: string): LogFile => {
    const [engine, logName] = engineLogName.split("/", 2);
    return new LogFile(engine as Engine, logName);
};

export class LogFile {
    /** the engine used to execute the test */
    public engine: Engine;
    /** the panic runtime used in the test */
    public panicRuntime: "abort" | "unwind";
    public testLogMap: Record<string, TestLog> = {};
    public logName: string;
    constructor(engine: Engine, logName: string) {
        this.logName = logName;
        this.engine = engine;
        const logPath = path.join(getTargetSubdir("test"), engine, logName);
        const [_profile, panicRuntime, _host, _] = logName.split("-", 4);
        this.panicRuntime = panicRuntime as "abort" | "unwind";
        const entries: RawLogEntry[] = fs
            .readFileSync(logPath, "utf8")
            .split("\n")
            .map((x) => {
                const line = x.trim();
                if (!line) {
                    return undefined;
                }
                try {
                    return JSON.parse(line);
                } catch (e) {
                    throw new Error("error parsing line: " + line, { cause: e });
                }
            })
            .filter(Boolean);
        entries.sort((a, b) => {
            return a.timestamp - b.timestamp;
        });
        const initMainThreadId = entries.filter((x) => x.type === "init-main-thread-id")[0];
        const mainThreadId = initMainThreadId.thread;
        if (initMainThreadId.payload !== `ThreadId(${mainThreadId})`) {
            throw new Error(
                "unexpected format of thread id payload; did rust's thread id implementation change?",
            );
        }
        // find all the test start messages
        const tests: [number, number, number, string][] = [];
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (entry.type === "test-start") {
                tests.push([entry.timestamp, i, -1, entry.payload]);
            } else if (entry.type === "test-end") {
                let found = false;
                for (let j = 0; j < tests.length; j++) {
                    if (tests[j][3] === entry.payload) {
                        found = true;
                        tests[j][2] = i;
                        break;
                    }
                }
                if (!found) {
                    throw new Error(
                        "invalid log file: test " + entry.payload + "ends before start",
                    );
                }
            }
        }
        for (const [startTimestamp, startIndex, endIndex, name] of tests) {
            if (endIndex === -1) {
                throw new Error(
                    "incomplete log file: test " +
                        name +
                        " does not have an end" +
                        `(in log ${logName}, engine ${engine}) - ${JSON.stringify(tests, undefined, 2)}`,
                );
            }
            let endTimestamp = -1;
            const processedEntries: LogEntry[] = [];
            for (let i = startIndex; i <= endIndex; i++) {
                if (entries[i].type === "test-end" && entries[i].payload === name) {
                    endTimestamp = entries[i].timestamp;
                    break;
                }
                if (entries[i].type === "test-log:" + name || entries[i].type === "panic") {
                    processedEntries.push(new LogEntry(entries[i], startTimestamp, mainThreadId));
                }
            }
            if (endTimestamp === -1) {
                throw new Error("failed to find end timestamp for test " + name);
            }
            const duration = endTimestamp - startTimestamp;
            this.testLogMap[name] = {
                duration,
                entries: processedEntries,
            };
        }
    }

    public getTestLog(testName: string): TestLog {
        const testLog = this.testLogMap[testName];
        if (!testLog) {
            throw new Error(
                "test log not found for name: " +
                    testName +
                    ` (in log ${this.logName}, engine ${this.engine})`,
            );
        }
        return testLog;
    }
}

export interface RawLogEntry {
    timestamp: number;
    thread: number;
    type: string;
    payload: string;
}

export interface TestLog {
    duration: number;
    entries: LogEntry[];
}

export class LogEntry {
    public timestamp: number;
    public mainThreadId: number;
    public thread: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public payload: any;
    public panic: PanicInfo | undefined;
    constructor(raw: RawLogEntry, startTimestamp: number, mainThreadId: number) {
        this.timestamp = raw.timestamp - startTimestamp;
        this.mainThreadId = mainThreadId;
        this.thread = raw.thread;
        if (raw.type === "panic") {
            const [panicLocation, message] = raw.payload.split("\n", 2);
            let colonI = panicLocation.lastIndexOf(":");
            let rest = panicLocation.substring(0, colonI);
            colonI = rest.lastIndexOf(":");
            const col = parseInt(rest.substring(colonI + 1));
            rest = rest.substring(0, colonI);
            colonI = rest.lastIndexOf(":");
            const line = parseInt(rest.substring(colonI + 1));
            rest = rest.substring(0, colonI);
            const relPathI = rest.lastIndexOf("packages");
            const relPath = rest
                .substring(relPathI + "packages".length)
                .replaceAll("\\", "/")
                .trim();
            this.panic = { file: relPath, line, col, message };
        } else {
            this.payload = JSON.parse(raw.payload);
        }
    }

    public isMainThread() {
        return this.thread === this.mainThreadId;
    }

    public toString() {
        return logEntryToString(this);
    }
}

/**
 * Format a log entry as a single line for human consumption.
 *
 * The timestamp is relative to the start of the test, and the thread column
 * is what most of these logs are actually about, so both are fixed-width to
 * keep them scannable down the page.
 */
export const logEntryToString = (entry: LogEntry): string => {
    const timestamp = `${entry.timestamp.toFixed(2)}ms`.padStart(11);
    const thread = (entry.isMainThread() ? "main" : `t${entry.thread}`).padStart(5);
    const { panic } = entry;
    const payload = panic
        ? `panic at ${panic.file}:${panic.line}:${panic.col} - ${panic.message}`
        : JSON.stringify(entry.payload);
    return `${timestamp} ${thread} | ${payload}`;
};

export interface PanicInfo {
    file: string;
    line: number;
    col: number;
    message: string;
}
