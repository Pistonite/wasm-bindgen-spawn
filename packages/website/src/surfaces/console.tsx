import { useLayoutEffect, useRef } from "react";

import { Button, Checkbox, ConsoleMessage } from "#components";
import { useStore } from "#harness";

import "./console.css";

/** how far off the bottom still counts as being at the bottom */
const STICK_SLACK_PX = 4;

export const ConsoleView: React.FC = () => {
    const messages = useStore((x) => x.messages);
    const clearMessages = useStore((x) => x.clearMessages);
    const autoClear = useStore((x) => x.autoClear);
    const setAutoClear = useStore((x) => x.setAutoClear);
    const runningCount = useStore((x) => x.runningCount);

    const outputRef = useRef<HTMLDivElement>(null);
    // follow new output only while the user is reading the bottom of the log
    const stuckToBottom = useRef(true);

    const onScroll = () => {
        const output = outputRef.current;
        if (output) {
            const distance = output.scrollHeight - output.scrollTop - output.clientHeight;
            stuckToBottom.current = distance <= STICK_SLACK_PX;
        }
    };

    // layout effect so the jump happens before the new messages are painted
    useLayoutEffect(() => {
        const output = outputRef.current;
        if (output && stuckToBottom.current) {
            output.scrollTop = output.scrollHeight;
        }
        // the running line changes the height too, so follow it as well
    }, [messages, runningCount]);

    return (
        <main className="console">
            <div className="console-bar">
                <h2 className="section-title">Console</h2>
                <span className="console-count">{messages.length}</span>
                <Checkbox checked={autoClear} onChange={setAutoClear}>
                    Auto clear
                </Checkbox>
                <Button onClick={clearMessages}>Clear</Button>
            </div>
            <div className="console-output" ref={outputRef} onScroll={onScroll}>
                {messages.length === 0 && runningCount === 0 && (
                    <p className="console-empty">Click an example to run it.</p>
                )}
                {messages.map((message) => (
                    <ConsoleMessage key={message.id} message={message} />
                ))}
                {runningCount > 0 && (
                    <p className="console-running" aria-live="polite">
                        {runningCount > 1 ? `running ${String(runningCount)} examples` : "running"}
                        <span className="console-running-dots">...</span>
                    </p>
                )}
            </div>
        </main>
    );
};
