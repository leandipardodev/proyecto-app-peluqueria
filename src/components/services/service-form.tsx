"use client";

import { createService, updateService } from "@/lib/dashboard/service-actions";
import { useState, useTransition, useRef, useEffect } from "react";
import EmojiPicker from "emoji-picker-react";

interface ServiceFormProps {
  service?: {
    id: string;
    name: string;
    price: number;
    duration_minutes: number;
  };
  onSuccess: () => void;
}

const durationOptions = [15, 30, 45, 60, 90, 120];

export default function ServiceForm({ service, onSuccess }: ServiceFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({});
  const [nameValue, setNameValue] = useState(service?.name || "");
  const nameRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function insertEmoji(emoji: string) {
    const clean = nameValue.replace(/^(\p{Emoji}\uFE0F?\u200D\p{Emoji}\uFE0F?|\p{Emoji}\uFE0F?|\p{Emoji_Presentation}|\p{Emoji_Modifier_Base})+\s*/u, "");
    const newVal = `${emoji} ${clean}`;
    setNameValue(newVal);
    setShowEmojis(false);
    nameRef.current?.focus();
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNameValue(e.target.value);
  }

  useEffect(() => {
    if (!showEmojis) return;
    function handleClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojis(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showEmojis]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("name", nameValue);

    const action = service
      ? () => updateService(service.id, formData)
      : () => createService(formData);

    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
      } else {
        onSuccess();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer">
          Nombre
        </label>
        <div className="flex gap-2">
          <input
            ref={nameRef}
            type="text"
            id="name"
            name="name"
            value={nameValue}
            onChange={handleNameChange}
            required
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            placeholder="Ej: Corte de pelo"
          />
          <div className="relative">
            <button
              ref={buttonRef}
              type="button"
              onClick={() => {
                if (!showEmojis && buttonRef.current) {
                  const rect = buttonRef.current.getBoundingClientRect();
                  const openUp = window.innerHeight - rect.bottom < 360;
                  setPickerStyle({
                    position: 'fixed',
                    top: openUp ? 'auto' : `${rect.bottom + 4}px`,
                    bottom: openUp ? `${window.innerHeight - rect.top + 4}px` : 'auto',
                    right: `${window.innerWidth - rect.right}px`,
                    zIndex: 9999,
                  });
                }
                setShowEmojis(!showEmojis);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors text-lg cursor-pointer select-none"
              title="Agregar emoji"
            >
              😀
            </button>
            {showEmojis && (
              <div
                ref={emojiRef}
                className="z-50"
                style={pickerStyle}
              >
                <EmojiPicker
                  onEmojiClick={(data) => insertEmoji(data.emoji)}
                  skinTonesDisabled
                  searchPlaceholder="Buscar emoji..."
                  width={300}
                  height={350}
                />
              </div>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Elegí un emoji para identificar el servicio visualmente en el calendario
        </p>
      </div>

      <div>
        <label
            htmlFor="price"
            className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer"
          >
            Precio ($)
          </label>
        <input
          type="number"
          id="price"
          name="price"
          step="0.01"
          min="0"
          defaultValue={service?.price ?? ""}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          placeholder="0.00"
        />
      </div>

      <div>
        <label
            htmlFor="duration_minutes"
            className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer"
          >
            Duración
          </label>
          <select
            id="duration_minutes"
            name="duration_minutes"
            defaultValue={service?.duration_minutes ?? 30}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent cursor-pointer"
        >
          {durationOptions.map((mins) => (
            <option key={mins} value={mins}>
              {mins} minutos
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
        >
          {pending
            ? "Guardando..."
            : service
              ? "Actualizar"
              : "Crear Servicio"}
        </button>
      </div>
    </form>
  );
}
