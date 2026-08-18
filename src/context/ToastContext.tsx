import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  /** Shows a small, auto-dismissing confirmation at the bottom of the screen. */
  showToast: (message: string, type?: ToastItem['type']) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const AUTO_DISMISS_MS = 3200;

/**
 * Lightweight toast/snackbar system for confirming routine actions ("Task
 * created", "Marked complete") that otherwise close a modal with no other
 * feedback. Deliberately separate from the inline `role="alert"` error
 * banners used throughout the app — those stay in place (in a form, next to
 * a list) to explain what went wrong; toasts are just a quick "done", so
 * they're only ever used for success, never for errors.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastItem['type'] = 'success') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`toast toast-${t.type}`}
            onClick={() => dismiss(t.id)}
          >
            {t.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
