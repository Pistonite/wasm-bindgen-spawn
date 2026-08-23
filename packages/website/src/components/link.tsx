import type { PropsWithChildren } from "react";

import "./link.css";

export type LinkProps = {
    pad?: boolean;
    href: string;
};

export const Link: React.FC<PropsWithChildren<LinkProps>> = ({ pad, href, children }) => {
    return (
        <>
            {pad && " "}
            <a className="doc-link" href={href} target="_blank" rel="noreferrer">
                {children}
            </a>
        </>
    );
};
