import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { initHarness } from "#harness";

import { App } from "./app.tsx";

const main = async () => {
    initHarness();
    const examples = loadExampleList();

    const root = createRoot(document.getElementById("-root-") as HTMLDivElement);
    root.render(
        <StrictMode>
            <App examples={examples} />
        </StrictMode>,
    );
};

const loadExampleList = async () => {
    const mod = await import(/* @vite-ignore */ location.origin + "/rt-abort/rt_abort.js");
    return Object.keys(mod).filter((x) => x.startsWith("example_"));
};

void main();
