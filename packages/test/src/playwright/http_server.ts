
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

import { BROWSER_ENGINES, getEngineNameFromUserAgent, TARGET_BUNDLE, TARGET_FRAMEWORK, TARGET_TEST } from "#framework";

// port for the HTTP server that the browser automation navigates to
const HTTP_PORT = 3001;

const COMMON_HEADERS = {
    // required headers for shared memory and atomics
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
    // disable cache since it's running tests
    "Cache-Control": "no-store",
} as const;

let instance: http.Server | undefined;
let closed = false;

export const stopHttpServer = async () => {
    if (closed) {
        return;
    }
    try {
        closed = true;
        console.log("shutting down http server");
        if (instance) {
            // close() alone hangs on keep-alive sockets
            instance.closeAllConnections();
            await new Promise<void>((resolve) => instance?.close(() => resolve()));
        }
    } catch(e) {
        console.error(e);
    }
}

export const startHttpServer = async (): Promise<void> => {
    // clean the browser test outputs
    for (const engine of BROWSER_ENGINES) {
        const dir = path.join(TARGET_TEST, engine);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
    }

    // using a queue to prevent partial writes to logs
    const logQueue = new Map<string, Promise<void>>();

    const server = http.createServer((req, res) => {
        void handleRequest(logQueue, req, res).catch((e) => {
            console.error("error handling request:", e);
            if (!res.headersSent) {
                res.writeHead(500);
            }
            res.end();
        });
    });

    await new Promise<void>((resolve, reject) => {
        server.on("error", reject);
        // we must serve on localhost and let the docker container share the host network
        // so the browser can treat the page as secure
        server.listen(HTTP_PORT, "127.0.0.1", resolve);
    });

    instance  = server;
    console.log(`http server listening on http://localhost:${HTTP_PORT}`);
};

const QUAD_PATTERN = /^[a-z0-9-]+$/;
const handleRequest = async (logQueue: Map<string, Promise<void>>,req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${HTTP_PORT}`);
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    // GET html/<quad>/index.html
    // -> serve browser/index.html and let client parse the url
    //    to load the test code accordingly
    // GET bundle/<quad>/<file>
    // -> serve the bundle file from target/bundle
    // POST harness/<quad>
    // -> logging harness
    const [route, quad, ...rest] = segments;

    if (!quad || !QUAD_PATTERN.test(quad)) {
        respond(res, 400, "text/plain", "invalid bundle id");
        return;
    }

    if (req.method === "GET" && route === "html" && rest.length === 1 && rest[0] === "index.html") {
        respondFile(res, path.join(TARGET_FRAMEWORK, "index.html"));
        return;
    }

    if (req.method === "GET" && route === "bundle" && rest.length > 0) {
        const filePath = path.resolve(TARGET_BUNDLE, quad, ...rest);
        if (!filePath.startsWith(TARGET_BUNDLE + path.sep)) {
            respond(res, 400, "text/plain", "invalid path");
            return;
        }
        respondFile(res, filePath);
        return;
    }

    if (req.method === "POST" && route === "harness" && rest.length === 0) {
        const ua = req.headers["user-agent"];
        if (!ua) {
            respond(res, 400, "text/plain", "invalid user-agent");
            return;
        }
        let engine: string;
        try {
            engine = getEngineNameFromUserAgent(ua);
        } catch {
            console.warn(`dropping harness output from unrecognized ua: ${ua}`);
            respond(res, 400, "text/plain", "unknown engine");
            return;
        }
        const body = await readBody(req);
        const logPath = path.join(TARGET_TEST, engine, `${quad}.log`);
        const previous = logQueue.get(logPath) ?? Promise.resolve();
        const next = previous.then(() => fs.promises.appendFile(logPath, body + "\n", "utf8"));
        logQueue.set(logPath, next.catch(() => {}));
        res.writeHead(204, COMMON_HEADERS);
        res.end();
        return;
    }

    respond(res, 404, "text/plain", "not found");
};


const readBody = async (req: http.IncomingMessage): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
};

const respond = (res: http.ServerResponse, status: number, contentType: string, body: string) => {
    res.writeHead(status, { ...COMMON_HEADERS, "Content-Type": contentType });
    res.end(body);
};

const respondFile = (res: http.ServerResponse, filePath: string) => {
    let content: Buffer;
    try {
        content = fs.readFileSync(filePath);
    } catch {
        respond(res, 404, "text/plain", "not found");
        return;
    }
    res.writeHead(200, { ...COMMON_HEADERS, "Content-Type": getContentType(filePath) });
    res.end(content);
};
const getContentType = (fileName: string): string | undefined => {
    if (fileName.endsWith(".html")) {
        return "text/html";
    }
    if (fileName.endsWith(".js")) {
        return "text/javascript";
    }
    if (fileName.endsWith(".wasm")) {
        return "application/wasm";
    }
    return undefined;
};
