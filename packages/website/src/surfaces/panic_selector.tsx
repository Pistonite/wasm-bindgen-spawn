import { Caption, Link, Section } from "#components";
import { type PanicRuntime, useStore } from "#harness";

import "./panic_selector.css";

const PANIC_RUNTIMES = ["unwind", "abort"] as const;

const PANIC_RUNTIME_DESCRIPTIONS: Record<PanicRuntime, string> = {
    unwind: "Panics use modern WASM exception handling to unwind the stack, so values are properly dropped upon panicking. Your project should use panic=unwind if possible.",
    abort: "Panics invoke unreachable and cause JS exceptions, making it not safe to continue using the WASM instance that panicked.",
};

// TODO: point this at doc website
const PANIC_RUNTIME_DOCS: Partial<Record<PanicRuntime, string>> = {
    unwind: "https://example.com/panic-unwind",
};

export const PanicRuntimeSelector: React.FC = () => {
    const value = useStore((x) => x.panicRuntime);
    const setPanicRuntime = useStore((x) => x.setPanicRuntime);

    const docs = PANIC_RUNTIME_DOCS[value];

    return (
        <Section title="Panic runtime">
            <div className="radio-group">
                {PANIC_RUNTIMES.map((runtime) => (
                    <label key={runtime} className="radio-option">
                        <input
                            type="radio"
                            name="panic-runtime"
                            value={runtime}
                            checked={value === runtime}
                            onChange={() => {
                                setPanicRuntime(runtime);
                            }}
                        />
                        <span>{runtime}</span>
                    </label>
                ))}
            </div>
            <Caption>
                {PANIC_RUNTIME_DESCRIPTIONS[value]}
                {docs !== undefined && (
                    <Link pad href={docs}>
                        Learn more
                    </Link>
                )}
            </Caption>
        </Section>
    );
};
