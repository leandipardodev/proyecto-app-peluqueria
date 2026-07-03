import { useEffect, useRef } from "react";

type HotkeyOptions = {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  /** Ignore shortcut when user is typing in an input/textarea/select */
  ignoreInput?: boolean;
  enabled?: boolean;
};

export function useHotkey(
  key: string,
  handler: (e: KeyboardEvent) => void,
  options?: HotkeyOptions
) {
  const handlerRef = useRef(handler);
  useEffect(() => { handlerRef.current = handler; }, [handler]);

  useEffect(() => {
    if (options?.enabled === false) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (options?.ignoreInput !== false) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }

      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      const needsCtrl = options?.ctrl || options?.meta;
      if (needsCtrl && !ctrlOrMeta) return;
      if (!needsCtrl && ctrlOrMeta) return;

      if (options?.shift && !e.shiftKey) return;
      if (!options?.shift && e.shiftKey) return;

      if (e.key.toLowerCase() === key.toLowerCase()) {
        handlerRef.current(e);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, options?.ctrl, options?.meta, options?.shift, options?.ignoreInput, options?.enabled]);
}
