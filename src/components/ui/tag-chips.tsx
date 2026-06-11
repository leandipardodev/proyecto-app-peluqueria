"use client";

import type { RefObject } from "react";

type TagChipsProps = {
  tags: string[];
  onInsert: (tag: string) => void;
};

export function TagChips({ tags, onInsert }: TagChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onInsert(tag)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700 hover:bg-violet-200 dark:hover:bg-violet-800/60 hover:shadow-sm transition-all cursor-pointer select-none"
        >
          @{tag}
        </button>
      ))}
    </div>
  );
}

export function useTagInsert(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (v: string) => void,
) {
  return (tag: string) => {
    const el = ref.current;
    if (!el) {
      onChange(value + (value ? " " : "") + `@${tag}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const insertion = `@${tag} `;
    const newValue = value.slice(0, start) + insertion + value.slice(end);
    onChange(newValue);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  };
}
