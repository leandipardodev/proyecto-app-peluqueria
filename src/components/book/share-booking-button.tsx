"use client";

import { useCallback, useState } from "react";
import { Check, Link2 } from "lucide-react";

type Props = {
  slug: string;
  className?: string;
  label?: string;
  copiedLabel?: string;
};

function bookingUrlFor(slug: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  return `${origin.replace(/\/+$/, "")}/book/${slug}`;
}

/**
 * Copiar el link de reservas.
 *
 * No se usa Web Share API a propósito: el link `/book/<slug>` es lo que el
 * dueño pega en la bio de Instagram, en stories y en la Publicación para que
 * sus clientes reserven. O sea, el destino real es el portapapeles, no la hoja
 * de compartir del sistema: abrir un selector de apps ahí es un paso de más
 * sobre la acción que el dueño ya sabe hacer.
 */
export default function ShareBookingButton({
  slug,
  className = "",
  label = "Copiar link de reservas",
  copiedLabel = "Link copiado",
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(async () => {
    const url = bookingUrlFor(slug);

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Sin permiso de clipboard (contexto no seguro, iframe, permiso denegado):
      // se usa el path viejo con un input temporal.
      const input = document.createElement("input");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }, [slug]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center justify-center gap-2 ${className}`}
    >
      {copied ? <Check className="w-4 h-4" aria-hidden /> : <Link2 className="w-4 h-4" aria-hidden />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}