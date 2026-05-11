import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const buttonVariants = {
  variant: {
    default: "bg-violet-600 text-white hover:bg-violet-700",
    destructive: "bg-red-600 text-white hover:bg-red-700",
    outline: "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-800",
    secondary: "bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-700",
    ghost: "hover:bg-gray-100 dark:hover:bg-gray-800",
    link: "text-violet-600 underline-offset-4 hover:text-violet-700",
  },
  size: {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10",
  },
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants.variant;
  size?: keyof typeof buttonVariants.size;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const baseClasses = cn(
      "inline-flex items-center justify-center rounded-2xl text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none",
      buttonVariants.variant[variant],
      buttonVariants.size[size],
      className
    );

    if (asChild) {
      const Comp = Slot;
      return <Comp className={baseClasses} ref={ref} {...props} />;
    }

    return (
      <motion.button
        className={baseClasses}
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
