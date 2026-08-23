import fs from "node:fs";
import path from "node:path";

import {
    getTargetSubdir,
    type PanicRuntime,
    type Engine,
    type Profile,
    type Target,
    BROWSER_ENGINES,
    type BrowserEngine,
} from "./util.ts";

export const saveLogFile = (engine: Engine, triple: string, rawLogContent: string) => {
    const logPath = getLogPath(engine, triple);
    const newLog = parseRawLogContent(engine, triple, rawLogContent);
    if (!fs.existsSync(logPath)) {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.writeFileSync(logPath, JSON.stringify(newLog, undefined, 2));
        return;
    }

    // assume saved log is correct format
    const currLogContent = fs.readFileSync(logPath, "utf8");
    const currLog: RawLog = JSON.parse(currLogContent);

    // merge logs
    newLog.tests = {
        ...currLog.tests,
        ...newLog.tests,
    };
    fs.writeFileSync(logPath, JSON.stringify(newLog, undefined, 2));
};

export const readLogFile = (engineLogName: string): LogFile => {
    const [engine, triple] = engineLogName.split("/", 2);
    const logPath = getLogPath(engine as Engine, triple);
    const currLogContent = fs.readFileSync(logPath, "utf8");
    const currLog: RawLog = JSON.parse(currLogContent);
    return new LogFileImpl(currLog);
};

const parseRawLogContent = (engine: Engine, triple: string, content: string): RawLog => {
    const [profile, panicRuntime] = triple.split("-", 2);
    const target = triple.substring(profile.length + panicRuntime.length + 2);
    const rawEntries: RawOutputEntry[] = content
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
    rawEntries.sort((a, b) => {
        return a.timestamp - b.timestamp;
    });
    const initMainThreadId = rawEntries.filter((x) => x.type === "init-main-thread-id")[0];
    const mainThreadId = initMainThreadId.thread;
    if (initMainThreadId.payload !== `ThreadId(${mainThreadId})`) {
        throw new Error(
            "unexpected format of thread id payload; did rust's thread id implementation change?",
        );
    }
    type Test = {
        startTimestamp: number;
        startIndex: number;
        endIndex: number;
        name: string;
    };
    // find all the test start messages
    const tests: Test[] = [];
    for (let i = 0; i < rawEntries.length; i++) {
        const entry = rawEntries[i];
        if (entry.type === "test-start") {
            tests.push({
                startTimestamp: entry.timestamp,
                startIndex: i,
                endIndex: -1,
                name: entry.payload,
            });
        } else if (entry.type === "test-end") {
            let found = false;
            for (let j = 0; j < tests.length; j++) {
                if (tests[j].name === entry.payload) {
                    found = true;
                    tests[j].endIndex = i;
                    break;
                }
            }
            if (!found) {
                throw new Error("invalid log file: test " + entry.payload + "ends before start");
            }
        }
    }

    const testMap: Record<string, RawTestLog> = {};
    for (const { startTimestamp, startIndex, endIndex, name } of tests) {
        if (endIndex === -1) {
            throw new Error(
                "incomplete log file: test " +
                    name +
                    " does not have an end" +
                    `(in triple ${triple}, engine ${engine}) - ${JSON.stringify(tests, undefined, 2)}`,
            );
        }
        let endTimestamp = -1;
        const filteredEntries: RawOutputEntry[] = [];
        for (let i = startIndex; i <= endIndex; i++) {
            if (rawEntries[i].type === "test-end" && rawEntries[i].payload === name) {
                endTimestamp = rawEntries[i].timestamp;
                break;
            }
            if (rawEntries[i].type === "test-log:" + name || rawEntries[i].type === "panic") {
                filteredEntries.push(rawEntries[i]);
            }
        }
        if (endTimestamp === -1) {
            throw new Error("failed to find end timestamp for test " + name);
        }
        const duration = endTimestamp - startTimestamp;
        testMap[name] = {
            duration,
            startTimestamp,
            mainThreadId,
            entries: filteredEntries,
        };
    }

    return {
        engine,
        profile: profile as Profile,
        panicRuntime: panicRuntime as PanicRuntime,
        target: target as Target,
        tests: testMap,
    };
};

const getLogPath = (engine: Engine, triple: string): string => {
    return path.join(getTargetSubdir("test"), engine, triple + ".json");
};

/** Raw log format saved to the output */
export interface RawLog {
    engine: Engine;
    profile: Profile;
    panicRuntime: PanicRuntime;
    target: Target;
    tests: Record<string, RawTestLog>;
}

/** Raw test log in RawLog */
export interface RawTestLog {
    duration: number;
    startTimestamp: number;
    mainThreadId: number;
    entries: RawOutputEntry[];
}

/** Raw entry logged by the test */
export interface RawOutputEntry {
    timestamp: number;
    thread: number;
    type: string;
    payload: string;
}

export interface LogFile {
    engine: Engine;
    profile: Profile;
    panicRuntime: PanicRuntime;
    target: Target;
    tests: Record<string, TestLog>;
    triple: string;

    getTestLog(test: string): TestLog;
    isBrowser(): boolean;
}

export class TestLog {
    public duration: number;
    public entries: LogEntry[];
    constructor(duration: number, entries: LogEntry[]) {
        this.duration = duration;
        this.entries = entries;
    }
    public panics() {
        return this.entries.filter((e) => e.panic) as (LogEntry & {
            panic: PanicInfo;
            payload: undefined;
        })[];
    }
}

export interface LogEntry {
    /* Test case local timestamp */
    timestamp: number;
    /* Main thread ID, currently this is always 1 */
    mainThreadId: number;
    /* Thread id of this entry */
    thread: number;
    /* JSON payload */
    payload: Record<string, unknown> | undefined;
    /* Panic info if this entry is logged by the panic hook */
    panic: PanicInfo | undefined;

    isMainThread(): boolean;
    toString(): string;
}

class LogFileImpl implements LogFile {
    public engine: Engine;
    public profile: Profile;
    public panicRuntime: PanicRuntime;
    public target: Target;
    public tests: Record<string, TestLog> = {};
    public triple: string;

    constructor(raw: RawLog) {
        this.engine = raw.engine;
        this.profile = raw.profile;
        this.panicRuntime = raw.panicRuntime;
        this.target = raw.target;
        this.triple = `${raw.profile}-${raw.panicRuntime}-${raw.target}`;

        for (const testName in raw.tests) {
            const test = raw.tests[testName];
            const entries = test.entries.map((x) =>
                parseLogEntry(x, test.startTimestamp, test.mainThreadId),
            );
            this.tests[testName] = new TestLog(test.duration, entries);
        }
    }

    public getTestLog(testName: string): TestLog {
        const testLog = this.tests[testName];
        if (!testLog) {
            throw new Error(
                "test log not found for name: " +
                    testName +
                    ` (in triple ${this.triple}, engine ${this.engine})`,
            );
        }
        return testLog;
    }

    public isBrowser() {
        return BROWSER_ENGINES.includes(this.engine as BrowserEngine);
    }
}

const parseLogEntry = (
    raw: RawOutputEntry,
    startTimestamp: number,
    mainThreadId: number,
): LogEntry => {
    const timestamp = raw.timestamp - startTimestamp;
    const thread = raw.thread;
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
        const panic = { file: relPath, line, col, message };
        return new LogEntryImpl({ timestamp, thread, mainThreadId, panic });
    }
    const payload = JSON.parse(raw.payload);
    return new LogEntryImpl({ timestamp, thread, mainThreadId, payload });
};

export class LogEntryImpl implements LogEntry {
    public timestamp: number;
    public mainThreadId: number;
    public thread: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public payload: any;
    public panic: PanicInfo | undefined;
    constructor(e: Partial<LogEntry>) {
        this.timestamp = e.timestamp || 0;
        this.mainThreadId = e.mainThreadId || 0;
        this.thread = e.thread || 0;
        this.panic = e.panic;
        this.payload = e.payload;
    }

    public isMainThread() {
        return this.thread === this.mainThreadId;
    }

    public toString() {
        const timestamp = `${this.timestamp.toFixed(2)}ms`.padStart(11);
        const thread = (this.isMainThread() ? "main" : `t${this.thread}`).padStart(5);
        const { panic } = this;
        const payload = panic
            ? `panic at ${panic.file}:${panic.line}:${panic.col} - ${panic.message}`
            : JSON.stringify(this.payload);
        return `${timestamp} ${thread} | ${payload}`;
    }
}

export interface PanicInfo {
    file: string;
    line: number;
    col: number;
    message: string;
}
