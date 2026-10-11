import { useEffect } from 'react';
import { dismissToast, useToastStore } from '../state/toastStore';

const TIMEOUT_MS = 8000;

export function Toast() {
  const toast = useToastStore((s) => s.toast);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(dismissToast, TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast-undo"
          onClick={() => {
            toast.action!.run();
            dismissToast();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={dismissToast}>
        ×
      </button>
    </div>
  );
}
