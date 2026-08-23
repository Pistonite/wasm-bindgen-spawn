import { Suspense, use } from "react";

import { Button, Caption, Section } from "#components";
import { runExampleWorker, useStore } from "#harness";

import "./examples.css";

export type ExampleSectionProps = {
    /** resolves to the example names exported by the wasm bundle */
    examples: Promise<string[]>;
};

export const ExampleSection: React.FC<ExampleSectionProps> = ({ examples }) => {
    return (
        <Section title="Examples" stretch>
            <Caption>
                Click an example to run it. The output will appear in the console. Each example will
                also print a link to view its source code on GitHub.
            </Caption>
            <Suspense fallback={<p className="example-loading">Loading ...</p>}>
                <ExampleList examples={examples} />
            </Suspense>
        </Section>
    );
};

const ExampleList: React.FC<ExampleSectionProps> = ({ examples }) => {
    const names = use(examples);

    return (
        <div className="example-list">
            {names.map((name) => (
                <Button
                    key={name}
                    code
                    onClick={async () => {
                        await runExampleWorker(name, useStore.getState().panicRuntime);
                    }}
                >
                    {name}
                </Button>
            ))}
        </div>
    );
};
