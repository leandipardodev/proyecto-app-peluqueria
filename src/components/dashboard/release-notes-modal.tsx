"use client";

import { useEffect, useMemo, useState } from "react";
import { APP_VERSION, RELEASE_NOTES_ITEMS, RELEASE_NOTES_TITLE } from "@/lib/app-version";
import BaseModal from "@/components/ui/modal";

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
    <BaseModal open={open} onClose={handleClose} title={RELEASE_NOTES_TITLE} subtitle="Te contamos rapido lo nuevo de esta version." maxWidth="lg" noHeaderBorder>
      <div className="px-5 pb-4">
        <div className="flex justify-end -mt-2 mb-2">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
            v{APP_VERSION}
          </span>
        </div>
        <ul className="space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
          {RELEASE_NOTES_ITEMS.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="px-5 pb-5 flex justify-end">
        <button type="button" onClick={handleClose} className="ui-btn-primary rounded-lg px-5 py-2 text-sm font-medium">Entendido</button>
      </div>
    </BaseModal>
  );
}
