import type { LogMessage } from "#harness";

import { JsonView } from "./json_view.tsx";
import { Link } from "./link.tsx";

import "./console_message.css";

export type ConsoleMessageProps = {
    message: LogMessage;
};

export const ConsoleMessage: React.FC<ConsoleMessageProps> = ({ message }) => {
    const isHarness = message.thread === 0;
    const isMain = message.thread === 1;
    return (
        <div className="console-row">
            {isHarness && <span className="thread-id thread-id-harness">{"<harness>"}</span>}
            {isMain && <span className="thread-id thread-id-main">{"Main"}</span>}
            {!isMain && !isHarness && <span className="thread-id">ThreadId({message.thread})</span>}
            <span className={isHarness ? "console-message harness" : "console-message"}>
                {!!message.test && <span className="badge badge-test">{message.test}</span>}
                {!!message.kind && (
                    <span className={`badge badge-${message.kind}`}>{message.kind}</span>
                )}
                {message.message}
                {message.link !== undefined && (
                    <Link pad href={message.link.url}>
                        {message.link.text}
                    </Link>
                )}
                {message.afterLink}
                {message.json !== undefined && <JsonView value={message.json} />}
            </span>
        </div>
    );
};
