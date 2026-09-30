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
  /** Marcado para irse: sigue montado mientras corre la animacion de salida. */
  exiting?: boolean;
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

const ENTER_MS = 320;
const EXIT_MS = 220;

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

  const trackTimer = useCallback((timer: ReturnType<typeof setTimeout>) => {
    toastTimersRef.current.add(timer);
    return timer;
  }, []);

  // Marca el aviso como exiting (corre la animacion de salida) y recien ahi, al
  // terminar, se desmonta. Antes se borraba del estado en el acto y React lo
  // desmontaba sin transicion: aparecia de golpe y se desaparecia de golpe.
  const startExit = useCallback(
    (id: string) => {
      setToasts((prev) => {
        if (!prev.some((t) => t.id === id && !t.exiting)) return prev;
        return prev.map((t) => (t.id === id ? { ...t, exiting: true } : t));
      });
      trackTimer(
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, EXIT_MS),
      );
    },
    [trackTimer],
  );

  const addToast = useCallback(
    (message: string, type: ToastType = "success", action?: ToastAction) => {
      const id = crypto.randomUUID();
      const duration = DURATIONS[type];
      setToasts((prev) => [...prev, { id, message, type, action, duration }]);
      // El auto-ocultado pasa por startExit y no por un borrado directo: si no, al
      // cumplirse el tiempo el aviso se evapora sin comprimirse.
      trackTimer(setTimeout(() => startExit(id), duration));
    },
    [startExit, trackTimer],
  );

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
            className={`pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-sm dark:shadow-2xl ${toast.exiting ? "animate-toast-exit" : "animate-toast-enter"} ${BG_CLASSES[toast.type]}`}
          >
            <div className="flex items-start gap-3">
              {ICONS[toast.type]}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{toast.message}</p>
                {toast.action && (
                  <button
                    onClick={() => {
                      toast.action?.onClick();
                      startExit(toast.id);
                    }}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-200 transition-colors cursor-pointer select-none"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => startExit(toast.id)}
                aria-label="Cerrar aviso"
                className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer select-none shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div
              aria-hidden
              className={`absolute bottom-0 left-0 h-1 origin-left ${BAR_CLASSES[toast.type]}`}
              style={
                // Al salir la barra se desvanece en vez de reiniciarse: si se
                // reprobara la animacion, Saltaria de vuelta al ancho completo
                // mientras el aviso se comprime.
                toast.exiting
                  ? { width: "100%", opacity: 0, transition: `opacity ${EXIT_MS}ms linear` }
                  : {
                      width: "100%",
                      // Espera a que la ventanita se termine de extender para arrancar
                      // a achicarse: asi la barra aparece entera y despues se consume.
                      animation: `toast-progress ${toast.duration}ms linear ${ENTER_MS}ms forwards`,
                    }
              }
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
