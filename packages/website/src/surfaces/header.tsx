import { Link, StatusItem, WasmIcon } from "#components";
import { GITHUB_LINK } from "#harness";

import "./header.css";

export const Header: React.FC = () => {
    return (
        <header className="header">
            <div className="brand">
                <WasmIcon />
                <h1 className="brand-title">wasm-bindgen-spawn playground</h1>
            </div>
            <div className="status-bar">
                <Link href="https://wbgspawn.pistonite.dev">Docs</Link>
                <Link href={GITHUB_LINK}>GitHub</Link>
                <StatusItem label="CrossOriginIsolated" ok={globalThis.crossOriginIsolated} />
                <StatusItem label="Build" ok={import.meta.env.COMMIT.substring(0, 8)} />
            </div>
        </header>
    );
};
