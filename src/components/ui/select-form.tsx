"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SelectFormProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | null;
  helperText?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const SelectForm = forwardRef<HTMLSelectElement, SelectFormProps>(
  ({ className, label, error, helperText, options, placeholder, id, ...props }, ref) => {
    const selectId = id || props.name;

    return (
      <div className="space-y-1">
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer"
        >
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={cn(
            "ui-select w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors bg-white",
            error
              ? "border-red-400 bg-red-50/30 focus:ring-red-400"
              : "border-gray-300",
            className
          )}
          aria-invalid={!!error}
          {...props}
        >
          {placeholder && <option value="" disabled>{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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
SelectForm.displayName = "SelectForm";
