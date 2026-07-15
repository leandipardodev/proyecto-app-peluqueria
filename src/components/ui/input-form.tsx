"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputFormProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  helperText?: string;
  hideLabel?: boolean;
  rightElement?: React.ReactNode;
}

export const InputForm = forwardRef<HTMLInputElement, InputFormProps>(
  ({ className, label, error, helperText, hideLabel, rightElement, id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="space-y-1">
        {!hideLabel && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors",
              error
                ? "border-red-400 bg-red-50/30 focus:ring-red-400"
                : "border-gray-300 bg-white",
              rightElement && "pr-10",
              className
            )}
            aria-invalid={!!error}
            aria-describedby={error && props.name ? `${props.name}-error` : undefined}
            {...props}
          />
          {rightElement && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              {rightElement}
            </div>
          )}
        </div>
        {error && (
          <p id={`${props.name}-error`} className="text-xs text-red-500 mt-0.5" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-xs text-gray-400 mt-0.5">{helperText}</p>
        )}
      </div>
    );
  }
);
InputForm.displayName = "InputForm";
