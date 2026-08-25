import type { PropsWithChildren } from "react";

import "./button.css";

export type ButtonProps = {
    onClick: () => void;
    /** render the label as code, for things like example names */
    code?: boolean;
};

export const Button: React.FC<PropsWithChildren<ButtonProps>> = ({ children, onClick, code }) => {
    return (
        <button type="button" className={code ? "button button-code" : "button"} onClick={onClick}>
            {children}
        </button>
    );
};
