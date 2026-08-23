import { ConsoleView, ExampleSection, Header, PanicRuntimeSelector } from "#surfaces";

import "./app.css";

export type AppProps = {
    /** resolves to the example names exported by the wasm bundle */
    examples: Promise<string[]>;
};

export const App: React.FC<AppProps> = ({ examples }) => {
    return (
        <div className="app">
            <Header />
            <div className="main">
                <aside className="sidebar">
                    <PanicRuntimeSelector />
                    <ExampleSection examples={examples} />
                </aside>
                <ConsoleView />
            </div>
        </div>
    );
};
