import { useEffect } from 'react';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  timeoutMs?: number;
}

export function UndoToast({ message, onUndo, onDismiss, timeoutMs = 8000 }: UndoToastProps) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, timeoutMs);
    return () => window.clearTimeout(id);
  }, [message, onDismiss, timeoutMs]);

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      <button type="button" className="toast-undo" onClick={onUndo}>
        Undo
      </button>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
