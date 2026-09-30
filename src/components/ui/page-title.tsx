import { Fragment } from "react";

/**
 * Titulo de categoria del dashboard, en la tipografia manuscrita (Borel), con
 * aparicion letra por letra de izquierda a derecha.
 *
 * Los `<h1>` estaban copiados a mano en cada pagina y cada copia se fue drifting
 * de las otras (sm:text-4xl / sm:text-5xl / lg:text-6xl, con y sin `pt-2`,
 * paletas mezcladas). Ademas los skeletons dibujaban un `h-7` que no coincidia
 * con el alto real y el layout saltaba al entrar la data. Con el titulo en un
 * solo lugar, el skeleton mide lo mismo (ver PageTitleSkeleton).
 *
 * El texto va en `aria-hidden` y el nombre accesible va en `aria-label` del h1:
 * las letras sueltas son una miranda para el lector de pantalla.
 *
 * `className` trae el tamano, el interlineado y los colores de cada pagina a
 * proposito: si esta los trae por defecto, un `sm:text-4xl` de la pagina de
 * inicio pelea contra el `sm:text-5xl` del default y gana el que Tailwind
 * genera despues, no el que se pasa despues en el atributo.
 */

const BASE_DELAY_MS = 150;
const CHAR_DELAY_MS = 32;
const CHAR_DURATION_MS = 600;

export default function PageTitle({
  children,
  className = "",
  delay = BASE_DELAY_MS,
}: {
  children: string;
  className?: string;
  delay?: number;
}) {
  const label = children.trim();
  const words = label.split(/\s+/);
  let charIndex = 0;

  return (
    <h1 aria-label={label} className={`page-title ${className}`}>
      {words.map((word, w) => (
        <Fragment key={`${word}-${w}`}>
          <span aria-hidden className="inline-block whitespace-nowrap">
            {[...word].map((char, c) => {
              const i = charIndex++;
              return (
                <span
                  key={`${char}-${c}`}
                  className="page-title-char inline-block"
                  style={{
                    animationDelay: `${delay + i * CHAR_DELAY_MS}ms`,
                    animationDuration: `${CHAR_DURATION_MS}ms`,
                  }}
                >
                  {char}
                </span>
              );
            })}
          </span>
          {/* El espacio va entre palabras y no dentro de una de ellas: si queda
              adentro, `whitespace-nowrap` lo colapsa y la fecha de Inicio sale
              como "miercoles,30deseptiembre". */}
          {w < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </h1>
  );
}

export function PageTitleSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      /* 30px + el pt-2 de .page-title = 38; desde sm, 48 + 8 = 56. Las paginas
         con lg:text-6xl (el calendario) pasan className="lg:h-[68px]". */
      className={`h-[38px] sm:h-[56px] w-44 sm:w-64 rounded-full bg-white/20 dark:bg-white/10 animate-pulse ${className}`}
    />
  );
}
