import { Fragment, useState } from "react";

import "./json_view.css";

export type JsonViewProps = {
    value: unknown;
};

/** one line collapsed, with the full pretty-printed value underneath when expanded */
export const JsonView: React.FC<JsonViewProps> = ({ value }) => {
    const [expanded, setExpanded] = useState(false);

    // scalars have nothing to expand into
    const canExpand = typeof value === "object" && value !== null;

    return (
        <>
            {canExpand && (
                <button
                    type="button"
                    className="json-toggle"
                    aria-expanded={expanded}
                    aria-label={expanded ? "Collapse" : "Expand"}
                    onClick={() => {
                        setExpanded((x) => !x);
                    }}
                >
                    <svg className="json-toggle-icon" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M5 2.5l8 5.5-8 5.5z" fill="currentColor" />
                    </svg>
                </button>
            )}
            {expanded ? (
                // the pretty block below already says everything, so elide the inline one
                <>
                    <span className="json-punct">{Array.isArray(value) ? "[...]" : "{...}"}</span>
                    {"\n"}
                    <JsonNode value={value} depth={0} pretty />
                </>
            ) : (
                <JsonNode value={value} depth={0} pretty={false} />
            )}
        </>
    );
};

type JsonNodeProps = {
    value: unknown;
    depth: number;
    /** lay the value out over multiple indented lines instead of one */
    pretty: boolean;
};

const INDENT = "  ";

const JsonNode: React.FC<JsonNodeProps> = ({ value, depth, pretty }) => {
    if (value === null) {
        return <span className="json-literal">null</span>;
    }
    if (typeof value === "string") {
        return <span className="json-string">{JSON.stringify(value)}</span>;
    }
    if (typeof value === "number") {
        return <span className="json-number">{String(value)}</span>;
    }
    if (typeof value === "boolean") {
        return <span className="json-literal">{String(value)}</span>;
    }
    // anything json can't represent (undefined, function, symbol, bigint)
    if (typeof value !== "object") {
        return <span className="json-literal">{String(value)}</span>;
    }

    const isArray = Array.isArray(value);
    const open = isArray ? "[" : "{";
    const close = isArray ? "]" : "}";

    // collapsed only ever shows the top level; anything nested is elided
    if (!pretty && depth > 0) {
        return <span className="json-punct">{open + "..." + close}</span>;
    }

    const entries: [string, unknown][] = isArray
        ? (value as unknown[]).map((x, i) => [String(i), x])
        : Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
        return <span className="json-punct">{open + close}</span>;
    }

    return (
        <>
            <span className="json-punct">{open} </span>
            {entries.map(([key, child], i) => (
                <Fragment key={key}>
                    {i > 0 && <span className="json-punct">,</span>}
                    {pretty ? "\n" + INDENT.repeat(depth + 1) : i > 0 ? " " : ""}
                    {!isArray && (
                        <>
                            <span className="json-key">{JSON.stringify(key)}</span>
                            <span className="json-punct">:</span>{" "}
                        </>
                    )}
                    <JsonNode value={child} depth={depth + 1} pretty={pretty} />
                </Fragment>
            ))}
            {pretty && "\n" + INDENT.repeat(depth)}
            <span className="json-punct">
                {!pretty && " "}
                {close}
            </span>
        </>
    );
};
