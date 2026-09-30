"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { motion } from "framer-motion";
import { isPerfModeOn } from "@/lib/use-performance-mode";

/**
 * Superficie con la misma entrada y salida que los avisos flotantes: aparece
 * como una bola circular y se abre hasta ser la capsula del contenido.
 *
 * El morph va por `clip-path` y no por `scale` porque escalando una capsula
 * ancha el resultado es una elipse, no una bola. Al ser `clip-path`, el recorta
 * el `shadow` mientras dura la morph: la bola se ve plana y la sombra vuelve
 * cuando la superficie esta abierta.
 *
 * En `perf-mode` se degrada a un fade (ver use-performance-mode.ts).
 */

const BALL = "circle(20px at 50% 50%)";
const OPEN = "circle(9999px at 50% 50%)";
const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];

const MORPH = {
  initial: { opacity: 0, y: 14, clipPath: BALL },
  animate: { opacity: 1, y: 0, clipPath: OPEN },
  exit: { opacity: 0, y: 14, clipPath: BALL },
  transition: { duration: 0.42, ease: EASE },
};

const FADE = {
  initial: { opacity: 0, y: 8, clipPath: "none" },
  animate: { opacity: 1, y: 0, clipPath: "none" },
  exit: { opacity: 0, y: 4, clipPath: "none" },
  transition: { duration: 0.18, ease: "easeOut" as const },
};

type MorphCardProps = {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  role?: string;
  "aria-modal"?: boolean | "true" | "false";
  "aria-label"?: string;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
};

export default function MorphCard({
  className = "",
  style,
  children,
  role,
  "aria-modal": ariaModal,
  "aria-label": ariaLabel,
  onClick,
}: MorphCardProps) {
  const perf = isPerfModeOn();
  const motionProps = perf ? FADE : MORPH;

  return (
    <motion.div
      className={`morph-card ${className}`}
      style={style}
      role={role}
      aria-modal={ariaModal}
      aria-label={ariaLabel}
      onClick={onClick}
      initial={motionProps.initial}
      animate={motionProps.animate}
      exit={motionProps.exit}
      transition={motionProps.transition}
    >
      {children}
    </motion.div>
  );
}
