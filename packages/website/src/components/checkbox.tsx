import type { PropsWithChildren } from "react";

import "./checkbox.css";

export type CheckboxProps = {
    checked: boolean;
    onChange: (checked: boolean) => void;
};

/**
 * The box and checkmark are drawn here rather than delegated to `input[type=checkbox]`,
 * whose metrics can't be lined up with the label across browsers. A button carries the
 * focus and keyboard handling that the input would have provided.
 */
export const Checkbox: React.FC<PropsWithChildren<CheckboxProps>> = ({
    children,
    checked,
    onChange,
}) => {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            className="checkbox"
            onClick={() => {
                onChange(!checked);
            }}
        >
            <span className="checkbox-box" aria-hidden="true">
                <svg className="checkbox-check" viewBox="0 0 16 16">
                    <path
                        d="M3.5 8.5l3 3 6-7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </span>
            <span className="checkbox-label">{children}</span>
        </button>
    );
};
