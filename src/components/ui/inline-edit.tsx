"use client";

import { useState, useRef, useEffect, useCallback, memo, type KeyboardEvent } from "react";

type Props = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
};

function InlineEdit({
  value,
  onChange,
  placeholder,
  multiline = false,
  className = "",
  inputClassName = "",
  disabled = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      if (!multiline) {
        (inputRef.current as HTMLInputElement)?.select();
      }
    }
  }, [editing, multiline]);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = useCallback(() => {
    onChange(draft);
    setEditing(false);
  }, [draft, onChange]);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  }

  const common = `bg-transparent outline-none ring-0 ${inputClassName}`;
  const editingRing = "ring-2 ring-[#0071E3]/25 shadow-sm rounded transition-all duration-150";
  const displayText = value || placeholder || "";

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={editing ? draft : value}
        onChange={(e) => { setDraft(e.target.value); if (!editing) setEditing(true); }}
        onFocus={() => { if (!editing) { setDraft(value); setEditing(true); } }}
        onBlur={() => { if (editing) commit(); }}
        onKeyDown={handleKeyDown}
        rows={3}
        className={`${common} w-full resize-none ${className} ${editing ? editingRing : ""}`}
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  }

  return (
    <span className="group relative inline-flex items-center w-full">
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={editing ? draft : value}
        onChange={(e) => { setDraft(e.target.value); if (!editing) setEditing(true); }}
        onFocus={() => { if (!editing) { setDraft(value); setEditing(true); } }}
        onBlur={() => { if (editing) commit(); }}
        onKeyDown={handleKeyDown}
        className={`${common} w-full transition-all duration-150 ${className} ${
          editing
            ? editingRing
            : "cursor-text group-hover:underline decoration-dashed decoration-zinc-400/35 underline-offset-2"
        }`}
        placeholder={placeholder}
        disabled={disabled}
      />
      {!disabled && !editing && (
        <span className="absolute -right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-70 transition-all duration-200 pointer-events-none">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </span>
      )}
    </span>
  );
}

export default memo(InlineEdit);
