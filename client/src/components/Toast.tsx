import { useEffect, useState } from "react";
import { subscribeToasts, dismiss, type Toast } from "../utils/toast";

export function ToastStack() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (!toasts.length) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-msg">{t.message}</span>
          <div className="toast-btns">
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.onAction();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
