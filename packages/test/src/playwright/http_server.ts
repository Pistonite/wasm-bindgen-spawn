import { X509Certificate } from "node:crypto";
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";

import { getEngineNameFromUserAgent, getPackageRoot, getTargetSubdir } from "#framework";

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

let instance: http.Server | https.Server | undefined;
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
    } catch (e) {
        console.error(e);
    }
};

export const startHttpServer = async (useHttps: boolean): Promise<void> => {
    // using a queue to prevent partial writes to logs
    const logQueue = new Map<string, Promise<void>>();

    const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
        void handleRequest(logQueue, req, res).catch(() => {
            // silently ignore errors since it messes up the playwright output
            // console.error("error handling request:", e);
            if (!res.headersSent) {
                res.writeHead(500);
            }
            res.end();
        });
    };

    let server: http.Server | https.Server;
    let host: string;
    if (useHttps) {
        try {
            const cert = loadCert();
            server = https.createServer({ key: cert.key, cert: cert.cert }, handler);
            // must match what the cert was issued for, or the browser rejects it.
            // whatever this resolves to has to point back at this machine
            host = cert.host;
        } catch {
            console.error("failed to load certificate, falling back to http");
            server = http.createServer(handler);
            host = "localhost";
        }
    } else {
        server = http.createServer(handler);
        host = "localhost";
    }

    await new Promise<void>((resolve, reject) => {
        server.on("error", reject);
        // serve on local network for debugbility
        server.listen(HTTP_PORT, "0.0.0.0", resolve);
    });

    instance = server;
    const origin = `${useHttps ? "https" : "http"}://${host}:${HTTP_PORT}`;
    console.log(`http server listening on ${origin}`);
};

interface Cert {
    key: Buffer;
    cert: Buffer;
    host: string;
}

const loadCert = (): Cert => {
    const CERT_DIR = path.resolve(getPackageRoot(), "..", "..", ".cert");
    const certPath = path.join(CERT_DIR, "cert.pem");
    const keyPath = path.join(CERT_DIR, "cert.key");
    for (const p of [certPath, keyPath]) {
        if (!fs.existsSync(p)) {
            throw new Error(`missing ${p}, cannot serve over https`);
        }
    }
    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);

    // take the host the cert was issued for, so the url we hand to the
    // browsers always matches the cert
    const x509 = new X509Certificate(cert);
    // subjectAltName looks like `DNS:foo.local, DNS:bar.local`
    const host =
        x509.subjectAltName
            ?.split(",")
            .map((x) => x.trim())
            .find((x) => x.startsWith("DNS:"))
            ?.substring("DNS:".length) ??
        // fall back to the common name for certs without a SAN
        x509.subject
            .split("\n")
            .map((x) => x.trim())
            .find((x) => x.startsWith("CN="))
            ?.substring("CN=".length);
    if (!host) {
        throw new Error(`could not read a host name from ${certPath}`);
    }

    return { key, cert, host };
};

const QUAD_PATTERN = /^[a-z0-9-]+$/;
const handleRequest = async (
    logQueue: Map<string, Promise<void>>,
    req: http.IncomingMessage,
    res: http.ServerResponse,
) => {
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
        respondFile(res, path.join(getTargetSubdir("framework"), "index.html"));
        return;
    }

    if (req.method === "GET" && route === "bundle" && rest.length > 0) {
        const targetBundleDir = getTargetSubdir("bundle");
        const filePath = path.resolve(targetBundleDir, quad, ...rest);
        if (!filePath.startsWith(targetBundleDir + path.sep)) {
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
        const logPath = path.join(getTargetSubdir("test"), engine, `${quad}.log`);
        const previous = logQueue.get(logPath) ?? Promise.resolve();
        const next = previous.then(() => fs.promises.appendFile(logPath, body + "\n", "utf8"));
        logQueue.set(
            logPath,
            next.catch(() => {}),
        );
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
