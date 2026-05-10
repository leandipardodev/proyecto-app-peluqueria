"use client";

import { useState } from "react";
import { Link, Copy, Check, ExternalLink } from "lucide-react";

interface ShareLinkCardProps {
  slug: string;
  shopName: string;
}

export default function ShareLinkCard({ slug, shopName }: ShareLinkCardProps) {
  const [copied, setCopied] = useState(false);

  if (!slug) return null;

  const bookingUrl = (() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const baseUrl = origin || process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
    return `${baseUrl.replace(/\/+$/, "")}/book/${slug}`;
  })();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.getElementById("booking-url-input") as HTMLInputElement;
      if (input) {
        input.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }

  function handlePreview() {
    window.open(bookingUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 transition-colors">
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
        <Link className="w-4 h-4 text-violet-600" />
        Tu link de reservas
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Compartí este link con tus clientes para que reserven online.
      </p>
      <div className="flex gap-2">
        <input
          id="booking-url-input"
          type="text"
          value={bookingUrl}
          readOnly
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none select-all"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          onClick={handleCopy}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer select-none"
          title="Copiar link"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={handlePreview}
          className="px-3 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors cursor-pointer select-none whitespace-nowrap"
        >
          <span className="hidden sm:inline">Ver mi local</span>
          <ExternalLink className="w-4 h-4 sm:ml-1.5 inline" />
        </button>
      </div>
      {copied && (
        <p className="mt-2 text-xs text-green-600 font-medium">
          ¡Copiado!
        </p>
      )}
    </div>
  );
}
