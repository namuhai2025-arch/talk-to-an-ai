"use client";

import React, { useRef, useLayoutEffect } from "react";

interface ChatComposerProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  disabled?: boolean;
  attachments?: File[];
  onAttachmentsChange?: (files: File[]) => void;
  canAttach?: boolean;
  placeholder?: string;
}

export default function ChatComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  attachments = [],
  onAttachmentsChange,
  canAttach = true,
  placeholder = "Message your workspace...",
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronously recalculate textarea height on every keystroke/value change
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const scrollH = el.scrollHeight;
    el.style.height = `${Math.min(Math.max(scrollH, 24), 260)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((value.trim() || attachments.length > 0) && !disabled) {
        onSend();
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !onAttachmentsChange) return;
    const newFiles = Array.from(e.target.files);
    onAttachmentsChange([...attachments, ...newFiles].slice(0, 15));
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    if (!onAttachmentsChange) return;
    onAttachmentsChange(attachments.filter((_, i) => i !== index));
  };

  const canSubmit = (value.trim().length > 0 || attachments.length > 0) && !disabled;

  return (
    <div className="w-full rounded-[24px] border border-stone-200/80 bg-[#f4eee6]/80 p-2 shadow-sm transition-all focus-within:border-stone-400 focus-within:bg-[#f4eee6] dark:border-stone-800 dark:bg-[#202020]">
      {/* File chips preview */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 px-2 pt-1">
          {attachments.map((file, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 rounded-md bg-stone-200/70 px-2.5 py-1 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300"
            >
              <span className="max-w-[140px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(idx)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 px-1">
        {/* Attachment paperclip */}
        {canAttach && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="mb-1 rounded-full p-1.5 text-stone-500 hover:bg-stone-300/40 hover:text-stone-800 disabled:opacity-40 dark:text-stone-400 dark:hover:bg-stone-700/50"
              title="Attach files (up to 15)"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          </>
        )}

        {/* Expanding Textarea */}
<textarea
  ref={textareaRef}
  rows={1}
  value={value}
  onChange={(e) => onChange(e.target.value)}
  onKeyDown={handleKeyDown}
  disabled={disabled}
  placeholder={placeholder}
  className="box-border max-h-[260px] min-h-[24px] flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-[15px] leading-6 text-stone-900 placeholder:text-stone-500 focus:outline-none dark:text-stone-900 dark:placeholder:text-stone-500"
/>

        {/* Submit button */}
        <button
          type="button"
          onClick={onSend}
          disabled={!canSubmit}
          className={[
            "mb-1 rounded-xl px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all",
            canSubmit
              ? "bg-[#333333] text-white hover:bg-black dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
              : "bg-stone-300/60 text-stone-400 cursor-not-allowed dark:bg-stone-800 dark:text-stone-600",
          ].join(" ")}
        >
          Send
        </button>
      </div>
    </div>
  );
}