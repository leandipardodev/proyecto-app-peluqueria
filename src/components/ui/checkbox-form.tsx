"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface CheckboxFormProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string | React.ReactNode;
  error?: string | null;
  helperText?: string;
}

export const CheckboxForm = forwardRef<HTMLInputElement, CheckboxFormProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const checkboxId = id || props.name;

    return (
      <div className="space-y-1">
        <label
          htmlFor={checkboxId}
          className={cn(
            "flex items-start gap-2.5 cursor-pointer rounded-xl border px-3 py-2.5 transition-colors",
            error
              ? "border-red-300 dark:border-red-700 bg-red-50/20 dark:bg-red-900/20"
              : "border-gray-200 dark:border-zinc-700 bg-white/60 dark:bg-zinc-800/60"
          )}
        >
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className={cn(
              "mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-zinc-600 text-violet-600 dark:text-violet-400 focus:ring-violet-500",
              className
            )}
            aria-invalid={!!error}
            {...props}
          />
          <span className="text-sm text-gray-700 dark:text-zinc-200 leading-5">{label}</span>
        </label>
        {error && (
          <p id={`${props.name}-error`} className="text-xs text-red-500 dark:text-red-400 mt-0.5" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-xs text-gray-400 dark:text-zinc-400 mt-0.5">{helperText}</p>
        )}
      </div>
    );
  }
);
CheckboxForm.displayName = "CheckboxForm";
