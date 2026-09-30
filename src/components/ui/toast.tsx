"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from "react";
import { X, CheckCircle, AlertCircle, Info, Undo2 } from "lucide-react";

type ToastType = "success" | "error" | "info";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type Toast = {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
  duration: number;
};

type ToastContextType = {
  addToast: (message: string, type?: ToastType, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { addToast: () => {} };
  }
  return ctx;
}

// Los errores necesitan mas tiempo para leerse, pero todos se ocultan solos:
// un mensaje flotante permanente tapaba la UI sin agregar informacion.
const DURATIONS: Record<ToastType, number> = {
  success: 3200,
  info: 4500,
  error: 6000,
};

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle className="w-5 h-5 shrink-0 text-green-500" />,
  error: <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />,
  info: <Info className="w-5 h-5 shrink-0 text-blue-500" />,
};

const BG_CLASSES: Record<ToastType, string> = {
  success: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
  error: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
  info: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
};

const BAR_CLASSES: Record<ToastType, string> = {
  success: "bg-green-500",
  error: "bg-red-500",
  info: "bg-blue-500",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = "success", action?: ToastAction) => {
    const id = crypto.randomUUID();
    const duration = DURATIONS[type];
    setToasts((prev) => [...prev, { id, message, type, action, duration }]);
    const timer = setTimeout(() => {
      toastTimersRef.current.delete(timer);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
    toastTimersRef.current.add(timer);
  }, []);

  return (
    <ToastContext.Provider value={useMemo(() => ({ addToast }), [addToast])}>
      {children}
      <div
        role="region"
        aria-label="Notificaciones"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col-reverse items-center gap-2 px-4 pb-4 sm:pb-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.type === "error" ? "alert" : "status"}
            aria-live={toast.type === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-sm dark:shadow-2xl animate-slide-up ${BG_CLASSES[toast.type]}`}
          >
            <div className="flex items-start gap-3">
              {ICONS[toast.type]}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{toast.message}</p>
                {toast.action && (
                  <button
                    onClick={() => {
                      toast.action?.onClick();
                      removeToast(toast.id);
                    }}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-200 transition-colors cursor-pointer select-none"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                aria-label="Cerrar aviso"
                className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer select-none shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div
              aria-hidden
              className={`absolute bottom-0 left-0 h-1 ${BAR_CLASSES[toast.type]}`}
              style={{
                animation: `toast-progress ${toast.duration}ms linear forwards`,
                width: "100%",
              }}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
