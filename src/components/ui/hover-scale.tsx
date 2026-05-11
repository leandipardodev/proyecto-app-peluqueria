"use client";

import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";

type HoverScaleProps = HTMLMotionProps<"div">;

export default function HoverScale({ children, ...props }: HoverScaleProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
