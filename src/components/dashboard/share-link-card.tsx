"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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
    <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 transition-colors">
      <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-3 tracking-tight">
        <Link className="w-4 h-4 text-violet-600" />
        Tu link de reservas
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
        Compartí este link con tus clientes para que reserven online.
      </p>
      <div className="flex gap-2">
        <input
          id="booking-url-input"
          type="text"
          value={bookingUrl}
          readOnly
          className="flex-1 px-4 py-2.5 border border-white/40 dark:border-white/10 rounded-full text-sm bg-white/40 dark:bg-black/30 backdrop-blur-sm text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-400/50 select-all"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          onClick={handleCopy}
          className="px-4 py-2 border border-white/40 dark:border-white/10 rounded-full text-sm text-zinc-500 dark:text-zinc-400 bg-white/40 dark:bg-black/30 backdrop-blur-sm hover:bg-white/70 dark:hover:bg-white/10 transition-all cursor-pointer select-none"
          title="Copiar link"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
        <motion.button
          onClick={handlePreview}
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="px-5 py-2.5 bg-violet-600 text-white rounded-full text-sm font-medium shadow-sm hover:bg-violet-700 transition-colors cursor-pointer select-none whitespace-nowrap"
        >
          <span className="hidden sm:inline">Ver mi local</span>
          <ExternalLink className="w-4 h-4 sm:ml-1.5 inline" />
        </motion.button>
      </div>
      {copied && (
        <p className="mt-2 text-xs text-green-600 font-medium">
          ¡Copiado!
        </p>
      )}
    </div>
  );
}
