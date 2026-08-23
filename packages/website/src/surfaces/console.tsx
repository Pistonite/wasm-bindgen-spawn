import { Button, ConsoleMessage } from "#components";
import { useStore } from "#harness";

import "./console.css";

export const ConsoleView: React.FC = () => {
    const messages = useStore((x) => x.messages);
    const clearMessages = useStore((x) => x.clearMessages);

    return (
        <main className="console">
            <div className="console-bar">
                <h2 className="section-title">Console</h2>
                <span className="console-count">{messages.length}</span>
                <Button onClick={clearMessages}>Clear</Button>
            </div>
            <div className="console-output">
                {messages.length === 0 ? (
                    <p className="console-empty">Click an example to run it.</p>
                ) : (
                    messages.map((message) => <ConsoleMessage key={message.id} message={message} />)
                )}
            </div>
        </main>
    );
};
