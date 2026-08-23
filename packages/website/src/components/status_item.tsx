import "./status_item.css";

export type StatusItemProps = {
    label: string;
    ok: boolean;
};

export const StatusItem: React.FC<StatusItemProps> = ({ label, ok }) => {
    return (
        <div className="status-item">
            <span className="status-label">{label}:</span>
            <span className={ok ? "status-value status-ok" : "status-value status-bad"}>
                {ok ? "✓" : "✗"} {String(ok)}
            </span>
        </div>
    );
};
