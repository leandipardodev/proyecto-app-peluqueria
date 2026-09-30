"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface TextareaFormProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | null;
  helperText?: string;
}

export const TextareaForm = forwardRef<HTMLTextAreaElement, TextareaFormProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const textareaId = id || props.name;

    return (
      <div className="space-y-1">
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1 cursor-pointer"
        >
          {label}
        </label>
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "w-full px-3 py-2.5 border rounded-lg text-sm text-gray-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors resize-none",
            error
              ? "border-red-400 dark:border-red-400 bg-red-50/30 dark:bg-red-900/20 focus:ring-red-400"
              : "border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800",
            className
          )}
          aria-invalid={!!error}
          rows={3}
          {...props}
        />
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
TextareaForm.displayName = "TextareaForm";
