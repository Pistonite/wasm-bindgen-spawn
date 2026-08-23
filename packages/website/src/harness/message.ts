import { GITHUB_LINK, type PanicRuntime, timestampNow } from "./util.ts";

/** Raw message logged by the harness code in Rust (or equivalent JS code trying to emulate it) */
export type HarnessMessage = {
    /** Timestamp when the message happened */
    timestamp: number;
    /** Type tag */
    type: string;
    /** Payload which depends on the type; usually a string or JSON payload */
    payload: string;
    /** Thread number or 0 if not applicable */
    thread: number;
};

export const makeHarnessMessage = (msg: string): HarnessMessage => {
    return {
        timestamp: timestampNow(),
        type: "harness",
        payload: msg,
        thread: 0,
    };
};

export const makeHarnessErrorMessage = (msg: string): HarnessMessage => {
    return {
        timestamp: timestampNow(),
        type: "error",
        payload: msg,
        thread: 0,
    };
};

/** Message passed between the website and the example runner worker */
export type WorkerMessage =
    | {
          type: "ready";
      }
    | {
          type: "run";
          example: string;
          panicRuntime: PanicRuntime;
      }
    | {
          type: "done";
      };

/** Message displayed in the website console */
export type LogMessage = {
    /** monotonic id */
    id: number;
    /** event timestamp used to ensure the messages are shown in order */
    timestamp: number;
    /** special kind if any */
    kind?: LogKind;
    /** ID of the thread that emits the message. Since rust thread IDs are non-zero, we use 0 to indicate harness */
    thread: number;
    /** If the message pertains to a test, the name of the test. This shows the test badge */
    test?: string;
    /** message body string */
    message?: string;
    /** optional link rendered after the message */
    link?: LogMessageLink;
    /** message after the link */
    afterLink?: string;
    /** optional json payload */
    json?: unknown;
};

/** Special log kind */
export type LogKind = "error" | "panic";

export type LogMessageLink = {
    url: string;
    /** what to show in place of the url */
    text: string;
};

let nextMessageId = 0;
// force reset message id so the messages don't duplicate during hot reload
if (import.meta.env.DEV) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((globalThis as any).__harness_message_module) {
        location.reload();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__harness_message_module = true;
}

export const parseHarnessMessage = (msg: HarnessMessage): LogMessage | undefined => {
    const id = nextMessageId++;
    if (msg.type.startsWith("test-log:")) {
        const testName = stripExamplePrefix(msg.type.substring("test-log:".length));
        try {
            const payload = JSON.parse(msg.payload) as unknown;
            return {
                id,
                timestamp: msg.timestamp,
                thread: msg.thread,
                test: testName,
                json: payload,
            };
        } catch {
            return {
                id,
                timestamp: msg.timestamp,
                thread: msg.thread,
                test: testName,
                message: msg.payload,
            };
        }
    }
    switch (msg.type) {
        case "harness": {
            return {
                id,
                timestamp: msg.timestamp,
                thread: 0,
                message: msg.payload,
            };
        }
        case "error": {
            return {
                id,
                timestamp: msg.timestamp,
                thread: msg.thread,
                kind: "error",
                message: msg.payload,
            };
        }
        case "panic": {
            const { file, line, col, message, url } = parsePanicPayload(msg.payload);
            return {
                id,
                timestamp: msg.timestamp,
                thread: msg.thread,
                kind: "panic",
                message: "panicked at",
                link: {
                    url,
                    text: file + ":" + line + ":" + col,
                },
                afterLink: "\n" + message,
            };
        }
        case "init-main-thread-id": {
            return {
                id,
                timestamp: msg.timestamp,
                thread: msg.thread,
                message: "Initializing thread dispatcher",
            };
        }
        case "test-src": {
            const [name, link] = parseSourceLocation(msg.payload);
            return {
                id,
                timestamp: msg.timestamp,
                thread: msg.thread,
                test: stripExamplePrefix(name),
                message: "View source of this example:",
                link,
            };
        }
        case "test-start": {
            return {
                id,
                timestamp: msg.timestamp,
                thread: msg.thread,
                test: stripExamplePrefix(msg.payload),
                message: "====== EXAMPLE OUTPUT START ======",
            };
        }
        case "test-end": {
            return {
                id,
                timestamp: msg.timestamp,
                thread: msg.thread,
                test: stripExamplePrefix(msg.payload),
                message: "====== EXAMPLE OUTPUT END ======",
            };
        }
    }
    console.log(msg);
    return {
        id,
        timestamp: msg.timestamp,
        thread: msg.thread,
        message: "Unknown message type, please check devtool",
    };
};

const stripExamplePrefix = (x: string): string => {
    if (x.startsWith("example_")) {
        return x.substring("example_".length);
    }
    return x;
};

const parseSourceLocation = (payload: string): [string, LogMessageLink] => {
    const [name, location] = payload.split("=", 2);
    const [file, line] = location.split(":", 2);
    const relPath = getCrateRelPath(file);
    let url = GITHUB_LINK + "/blob/" + import.meta.env.COMMIT + "/packages/example/" + relPath;
    let lineNum = 0;
    if (line) {
        try {
            lineNum = parseInt(line);
            if (Number.isInteger(lineNum) && lineNum > 1) {
                lineNum--;
                url += "#L" + lineNum;
            } else {
                lineNum = 0;
            }
        } catch {
            /* ignore bad line number */
        }
    }
    return [
        name,
        {
            url,
            text: relPath + (lineNum ? `:${lineNum}` : ""),
        },
    ];
};

const parsePanicPayload = (payload: string) => {
    const [location, message] = payload.split("\n");
    const relPath = getCrateRelPath(location);
    const [file, line, col] = relPath.split(":");
    const url =
        GITHUB_LINK + "/blob/" + import.meta.env.COMMIT + "/packages/example/" + file + "#L" + line;
    return { file: "<crate>/" + file, line, col, message, url };
};

const getCrateRelPath = (file: string): string => {
    const srcI = file.lastIndexOf("src");
    if (srcI < 0) {
        return file;
    }
    const after = file.substring(srcI);
    let i = 0;
    for (; i < after.length; i++) {
        if (after[i] !== "/" && after[i] !== "\\") {
            break;
        }
    }
    return after.substring(i).replaceAll("\\", "/").trim();
};
