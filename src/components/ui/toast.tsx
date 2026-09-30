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

const ENTER_MS = 420;
const EXIT_MS = 420;
const MAX_VISIBLE = 3;

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
      // Tope de avisos en pantalla: cada uno anima el clip-path al entrar y al
      // salir, y un guardado con muchos fallos los encolaba a todos juntos.
      setToasts((prev) => [...prev, { id, message, type, action, duration }].slice(-MAX_VISIBLE));
      // El auto-ocultado pasa por startExit y no por un borrado directo: si no, al
      // cumplirse el tiempo el aviso se evapora sin comprimirse.
      trackTimer(setTimeout(() => startExit(id), ENTER_MS + duration));
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
            className={`relative w-full max-w-md overflow-hidden rounded-2xl border px-4 py-3 shadow-xl dark:shadow-2xl ${toast.exiting ? "pointer-events-none animate-morph-out" : "pointer-events-auto animate-morph"} ${BG_CLASSES[toast.type]}`}
          >
            <div
              className={`flex items-start gap-3 ${toast.exiting ? "animate-morph-content-out" : "animate-morph-content"}`}
            >
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
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-1">
              {(["left", "right"] as const).map((side) => (
                <div
                  key={side}
                  className={`toast-progress-bar absolute inset-y-0 w-1/2 ${BAR_CLASSES[toast.type]} ${side === "left" ? "left-0" : "right-0"}`}
                  style={
                    // Cada mitad se achica desde su borde hacia el centro: juntas
                    // arrancan al tope y se van juntando hasta desaparecer. Al
                    // cerrar antes de tiempo solo se desvanecen, porque si se
                    // reprobara el conteo la linea saltaria de vuelta al tope.
                    toast.exiting
                      ? {
                          transformOrigin: "center",
                          animation: `morph-bar-out ${Math.round(EXIT_MS * 0.6)}ms linear forwards`,
                        }
                      : {
                          transformOrigin: side === "left" ? "right center" : "left center",
                          animation: `morph-progress ${toast.duration}ms linear ${ENTER_MS}ms both`,
                        }
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
