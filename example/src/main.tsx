import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const worker = new Worker("worker.js");

const examples = [
  "example_join_handle",
  "example_mpsc_channel",
  "example_atomic_usize",
  "example_atomic_usize_pooled",
  "example_sleep",
  "example_mutex",
  "example_mutex_poison",
];

function invokeWorkerMethod(method: string) {
  worker.postMessage(method);
}

function ExampleButton({ method }: { method: string }) {
  return <button onClick={() => invokeWorkerMethod(method)}>{method}</button>;
}

function App() {
  return (
    <>
      <h1>wasm-bindgen-spawn Example</h1>
      <div style={{ padding: "2em" }}>
        <p>
          Cross-Origin Isolation Enabled: {`${globalThis.crossOriginIsolated}`}
        </p>
        <div style={{ display: "flex", gap: "2em", flexDirection: "column" }}>
          {examples.map((example) => (
            <ExampleButton key={example} method={example} />
          ))}
        </div>
      </div>
      <p style={{ color: "#888" }}>Open the console to see the output</p>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
