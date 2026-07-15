"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SubmitBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isPending?: boolean;
  pendingText?: string;
  defaultText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

const variantClasses = {
  primary:
    "bg-violet-600 text-white shadow-sm hover:bg-violet-700 focus-visible:ring-violet-500",
  secondary:
    "bg-white text-gray-900 border border-gray-300 shadow-sm hover:bg-gray-50 focus-visible:ring-gray-400",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500",
  ghost:
    "bg-transparent text-gray-600 hover:text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-400",
};

const sizeClasses = {
  sm: "py-2 px-3 text-xs rounded-xl",
  md: "py-2.5 px-4 text-sm rounded-2xl",
  lg: "py-3 px-5 text-base rounded-2xl",
};

export const SubmitBtn = forwardRef<HTMLButtonElement, SubmitBtnProps>(
  (
    {
      className,
      isPending = false,
      pendingText = "Guardando...",
      defaultText = "Guardar",
      variant = "primary",
      size = "md",
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="submit"
        disabled={disabled || isPending}
        className={cn(
          "w-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {isPending ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {pendingText}
          </span>
        ) : (
          children || defaultText
        )}
      </button>
    );
  }
);
SubmitBtn.displayName = "SubmitBtn";
