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

    function focusNext(container: HTMLElement) {
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const current = document.activeElement;
      for (let i = 0; i < focusable.length; i++) {
        if (focusable[i] === current && i + 1 < focusable.length) {
          focusable[i + 1].focus();
          break;
        }
      }
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
      siblings[nextIdx].focus();
    }

    const el = form;

    function cleanupTimer() {
      if (pressTimer.current !== null) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter") {
        const target = e.target as HTMLElement;
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

        if (!e.repeat) {
          e.preventDefault();
          isLongPress.current = false;
          el.classList.add("hold-active");

          pressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            el.classList.remove("hold-active");
            onSubmitRef.current?.();
          }, longPressDelay);
        }
      }

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        navigateButtonGroup("next");
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
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
          const tag = target.tagName;
          if (tag === "TEXTAREA" || tag === "SELECT") return;
          if (target.getAttribute("data-form-nav") === "skip") return;
          focusNext(el);
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
}

export function FormWithKeyboardNav({
  onSubmit,
  onCancel,
  className,
  id,
  children,
}: FormWithKeyboardNavProps) {
  const formRef = useRef<HTMLFormElement>(null);
  useFormKeyboardNav(formRef, {
    onSubmit: () => formRef.current?.requestSubmit(),
    onCancel,
  });

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const raf = requestAnimationFrame(() => {
      const first = form.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <form ref={formRef} onSubmit={onSubmit} id={id} className={className}>
      {children}
    </form>
  );
}
