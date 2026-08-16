const [payload, type, thread] = ARG;
if (payload instanceof Error) {
    if ("message" in payload) {
        payload = payload.message;
    } else if (("toString" in payload) && typeof payload.toString === "function") {
        payload = payload.toString();
    } else {
        payload = `${payload}`;
    }
}
return JSON.stringify({timestamp: performance.now(),thread,type, payload});
