import { cn } from "@/lib/utils";

type SpinnerProps = {
  className?: string;
};

/**
 * Spinner unico del proyecto. El `inline-block` es obligatorio: un <span>
 * inline ignora width/height, y sin el el circulo se renderiza como una linea
 * de 2px que al girar parece un elemento roto.
 */
export function Spinner({ className }: SpinnerProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent",
        "motion-safe:animate-spin motion-reduce:animate-pulse",
        className
      )}
    />
  );
}
