import "./status_item.css";

export type StatusItemProps = {
    label: string;
    ok: boolean | string;
};

export const StatusItem: React.FC<StatusItemProps> = ({ label, ok }) => {
    return (
        <div className="status-item">
            <span className="status-label">{label}:</span>
            <span
                className={
                    "status-value" +
                    (typeof ok === "boolean" ? (ok ? " status-ok" : " status-bad") : "")
                }
            >
                {typeof ok === "boolean" && (ok ? "✓" : "✗")} {String(ok)}
            </span>
        </div>
    );
};
