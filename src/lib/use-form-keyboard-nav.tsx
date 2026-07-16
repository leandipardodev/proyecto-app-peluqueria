"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  "select:not([disabled])",
  'textarea:not([disabled])',
  'button:not([disabled]):not([data-form-nav="skip"])',
  '[role="button"]:not([disabled]):not([data-form-nav="skip"])',
].join(", ");

interface UseFormKeyboardNavOptions {
  onSubmit?: () => void;
  onCancel?: () => void;
  longPressDelay?: number;
}

export function useFormKeyboardNav<T extends HTMLElement>(
  formRef: React.RefObject<T | null>,
  options?: UseFormKeyboardNavOptions
) {
  const { onSubmit, onCancel, longPressDelay = 800 } = options ?? {};
  const onSubmitRef = useRef(onSubmit);
  const onCancelRef = useRef(onCancel);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    function isButtonLike(el: HTMLElement) {
      return el.tagName === "BUTTON" || el.getAttribute("role") === "button";
    }

    function isSelfManaged(el: HTMLElement) {
      return el.getAttribute("data-form-nav") === "self";
    }

    function getAllFocusable() {
      return el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    }

    function getActiveIndex(all: NodeListOf<HTMLElement>) {
      const current = document.activeElement as HTMLElement | null;
      if (!current) return -1;
      for (let i = 0; i < all.length; i++) {
        if (all[i] === current) return i;
      }
      return -1;
    }

    function focusPrevField() {
      const all = getAllFocusable();
      const idx = getActiveIndex(all);
      if (idx < 0) return;
      let prev = idx - 1;
      if (isButtonLike(all[idx])) {
        const parent = all[idx].parentElement;
        while (prev >= 0 && isButtonLike(all[prev]) && all[prev].parentElement === parent) {
          prev--;
        }
      }
      if (prev >= 0) all[prev].focus();
    }

    function focusNextField() {
      const all = getAllFocusable();
      const idx = getActiveIndex(all);
      if (idx < 0) return;
      // Saltar botones del mismo grupo (mismo padre) para avanzar al siguiente campo
      let next = idx + 1;
      if (isButtonLike(all[idx])) {
        const parent = all[idx].parentElement;
        while (
          next < all.length &&
          isButtonLike(all[next]) &&
          all[next].parentElement === parent
        ) {
          next++;
        }
      }
      if (next < all.length) all[next].focus();
    }

    function navigateButtonGroup(direction: "prev" | "next") {
      const target = document.activeElement;
      if (!target || (target.tagName !== "BUTTON" && target.getAttribute("role") !== "button")) return;
      if (target.getAttribute("data-form-nav") === "skip") return;
      const parent = target.parentElement;
      if (!parent) return;
      const siblings = parent.querySelectorAll<HTMLElement>(
        ':scope > button:not([disabled]):not([data-form-nav="skip"]), :scope > [role="button"]:not([disabled]):not([data-form-nav="skip"])'
      );
      if (siblings.length < 2) return;
      const currentIdx = Array.from(siblings).indexOf(target as HTMLElement);
      const nextIdx =
        direction === "next"
          ? (currentIdx + 1) % siblings.length
          : (currentIdx - 1 + siblings.length) % siblings.length;
      const next = siblings[nextIdx];
      if (next.getAttribute("data-form-nav") === "select") {
        next.click();
        next.focus();
      } else {
        next.focus();
      }
    }

    const el = form;

    function cleanupTimer() {
      if (pressTimer.current !== null) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;

      if (isSelfManaged(target)) return;

      if (e.key === "Enter") {
        const tag = target.tagName;

        if (tag === "TEXTAREA") {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onSubmitRef.current?.();
          }
          return;
        }

        if (tag === "SELECT") return;

        if (target.getAttribute("data-form-nav") === "skip") return;

        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          onSubmitRef.current?.();
          return;
        }

        // Botones manejan su propio Enter (dropdowns, toggles, etc.)
        if (tag === "BUTTON" || target.getAttribute("role") === "button") {
          if (target.getAttribute("data-form-nav") === "select") {
            e.preventDefault();
          }
          return;
        }

        if (!e.repeat) {
          e.preventDefault();
          const holdBtn = el.querySelector<HTMLButtonElement>('button[type="submit"]');
          if (holdBtn?.disabled) return;
          isLongPress.current = false;
          el.classList.add("hold-active");

          pressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            el.classList.remove("hold-active");
            onSubmitRef.current?.();
          }, longPressDelay);
        }
      }

      if (e.key === "ArrowDown" && !e.shiftKey) {
        const tag = target.tagName;
        if (tag !== "TEXTAREA" && tag !== "SELECT") e.preventDefault();
        focusNextField();
      }
      if (e.key === "ArrowUp") {
        const tag = target.tagName;
        if (tag !== "TEXTAREA" && tag !== "SELECT") e.preventDefault();
        focusPrevField();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateButtonGroup("next");
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateButtonGroup("prev");
      }

      if (e.key === "Escape") {
        cleanupTimer();
        el.classList.remove("hold-active");
        onCancelRef.current?.();
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "Enter") {
        cleanupTimer();
        el.classList.remove("hold-active");

        if (!isLongPress.current) {
          const target = e.target as HTMLElement;
          if (isSelfManaged(target)) return;
          const tag = target.tagName;
          if (tag === "TEXTAREA" || tag === "SELECT") return;
          if (tag === "BUTTON" || target.getAttribute("role") === "button") {
              if (target.getAttribute("data-form-nav") === "select") {
                  focusNextField();
                }
            return;
          }
          if (target.getAttribute("data-form-nav") === "skip") return;
          focusNextField();
        }
      }
    }

    el.addEventListener("keydown", handleKeyDown);
    el.addEventListener("keyup", handleKeyUp);

    return () => {
      el.removeEventListener("keydown", handleKeyDown);
      el.removeEventListener("keyup", handleKeyUp);
      cleanupTimer();
    };
  }, [formRef, longPressDelay]);
}

interface FormWithKeyboardNavProps {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  className?: string;
  id?: string;
  children: ReactNode;
  autoFocusOnMount?: boolean;
}

export function FormWithKeyboardNav({
  onSubmit,
  onCancel,
  className,
  id,
  children,
  autoFocusOnMount = true,
}: FormWithKeyboardNavProps) {
  const formRef = useRef<HTMLFormElement>(null);
  useFormKeyboardNav(formRef, {
    onSubmit: () => formRef.current?.requestSubmit(),
    onCancel,
  });

  useEffect(() => {
    if (!autoFocusOnMount) return;
    const form = formRef.current;
    if (!form) return;
    const raf = requestAnimationFrame(() => {
      const first = form.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [autoFocusOnMount]);

  return (
    <form ref={formRef} onSubmit={onSubmit} id={id} className={className}>
      {children}
    </form>
  );
}
