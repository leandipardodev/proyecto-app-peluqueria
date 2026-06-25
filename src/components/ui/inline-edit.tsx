"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";

type Props = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
};

export default function InlineEdit({
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

  function startEditing() {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    onChange(draft);
    setEditing(false);
  }

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

  if (editing) {
    const common = `bg-transparent outline-none ring-0 ${inputClassName}`;
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          rows={3}
          className={`${common} w-full resize-none ${className}`}
          placeholder={placeholder}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={`${common} w-full ${className}`}
        placeholder={placeholder}
      />
    );
  }

  const displayText = value || placeholder || "";

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className={`group relative w-full cursor-text text-left disabled:cursor-default ${className}`}
    >
      <span>{displayText}</span>
      {!disabled && (
        <span className="absolute -right-5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </span>
      )}
    </button>
  );
}
