import type { PropsWithChildren } from "react";

import "./section.css";

export type SectionProps = {
    stretch?: boolean;
    title: string;
};

export const Section: React.FC<PropsWithChildren<SectionProps>> = ({
    stretch,
    title,
    children,
}) => {
    return (
        <section className={stretch ? "section section-stretch" : "section"}>
            <h2 className="section-title">{title}</h2>
            {children}
        </section>
    );
};

export const Caption: React.FC<PropsWithChildren> = ({ children }) => {
    return <p className="section-caption">{children}</p>;
};
