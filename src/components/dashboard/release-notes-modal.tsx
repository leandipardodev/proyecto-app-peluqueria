"use client";

import { useEffect, useMemo, useState } from "react";
import { APP_VERSION, RELEASE_NOTES_ITEMS, RELEASE_NOTES_TITLE } from "@/lib/app-version";

const STORAGE_PREFIX = "klip_release_notes_seen_";

export default function ReleaseNotesModal() {
  const [open, setOpen] = useState(false);

  const storageKey = useMemo(() => `${STORAGE_PREFIX}${APP_VERSION}`, []);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(storageKey);
      if (!seen) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [storageKey]);

  function handleClose() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {}
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/20 bg-white/95 p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950/92">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{RELEASE_NOTES_TITLE}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Te contamos rapido lo nuevo de esta version.</p>
          </div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
            v{APP_VERSION}
          </span>
        </div>

        <ul className="mt-5 space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
          {RELEASE_NOTES_ITEMS.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full bg-[#0071E3] px-5 py-2 text-sm font-medium text-white hover:bg-[#005fcc] transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
