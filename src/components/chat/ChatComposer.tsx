"use client";

import { useLayoutEffect, useRef } from "react";

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
};

export default function ChatComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Type your message...",
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    /*
     * Use screen height instead of visualViewport height.
     * The visual viewport shrinks when the iPhone keyboard opens,
     * which was making the composer shrink while typing.
     */
    const availableHeight =
  window.visualViewport?.height ?? window.innerHeight;

const maxHeight = Math.max(
  144,
  Math.min(availableHeight * 0.48, 320)
);

    textarea.style.height = "0px";

    const contentHeight = textarea.scrollHeight;
    const nextHeight = Math.min(contentHeight, maxHeight);

    textarea.style.height = `${Math.max(nextHeight, 32)}px`;
    textarea.style.overflowY =
      contentHeight > maxHeight ? "auto" : "hidden";

    /*
     * While the entire draft still fits, keep the textarea positioned
     * at the beginning rather than retaining an old internal scroll.
     */
    if (contentHeight <= maxHeight) {
      textarea.scrollTop = 0;
    }
  }, [value]);

  const submitMessage = () => {
    if (disabled || !value.trim()) return;
    onSend();
  };

  return (
    <form
      className="relative z-40 flex shrink-0 items-end gap-2 border-t border-stone-200 bg-[#f7f1e8]/95 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        submitMessage();
      }}
    >
      <div className="talkio-input flex min-h-[48px] flex-1 items-end overflow-hidden rounded-md border border-stone-300 bg-white px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitMessage();
            }
          }}
          className="h-[32px] w-full resize-none border-0 bg-transparent p-0 text-[16px] leading-6 outline-none placeholder:text-stone-400 disabled:opacity-60"
          style={{
            borderRadius: "0px",
            WebkitAppearance: "none",
            appearance: "none",
          }}
        />
      </div>

      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="h-[48px] min-w-[64px] rounded-md bg-[#78906f] px-4 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}