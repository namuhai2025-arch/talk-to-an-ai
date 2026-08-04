"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onOpenReflections: () => void;
  disabled?: boolean;
  placeholder?: string;
};

function ChatComposer({
  value,
  onChange,
  onSend,
  onOpenReflections,
  disabled = false,
  placeholder = "Type your message...",
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const maxHeightRef = useRef(320);

  const [isFocused, setIsFocused] = useState(false);

  const updateMaximumHeight = useCallback(() => {
    const layoutHeight = window.innerHeight;

    maxHeightRef.current = Math.max(
      144,
      Math.min(layoutHeight * 0.48, 320),
    );
  }, []);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      const currentTextarea = textareaRef.current;
      if (!currentTextarea) return;

      const maxHeight = maxHeightRef.current;

      currentTextarea.style.height = "auto";

      const contentHeight = currentTextarea.scrollHeight;

      const nextHeight = Math.max(
        32,
        Math.min(contentHeight, maxHeight),
      );

      currentTextarea.style.height = `${nextHeight}px`;

      currentTextarea.style.overflowY =
        contentHeight > maxHeight ? "auto" : "hidden";

      if (contentHeight <= maxHeight) {
        currentTextarea.scrollTop = 0;
      }

      resizeFrameRef.current = null;
    });
  }, []);

  useEffect(() => {
    updateMaximumHeight();
    resizeTextarea();

    const handleWindowResize = () => {
      updateMaximumHeight();
      resizeTextarea();
    };

    window.addEventListener("resize", handleWindowResize, {
      passive: true,
    });

    return () => {
      window.removeEventListener("resize", handleWindowResize);

      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [resizeTextarea, updateMaximumHeight]);

  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  const trimmedValue = value.trim();
  const canSend = !disabled && trimmedValue.length > 0;

  /*
   * The message field expands left when focused or when text exists.
   * Otherwise, space is reserved for the reflections icon.
   */
  const isComposerExpanded =
    isFocused || value.length > 0;

  const submitMessage = useCallback(() => {
    if (!canSend) return;
    onSend();
  }, [canSend, onSend]);

  return (
    <form
      className="
        relative z-40 flex shrink-0 items-end gap-2
        border-t border-stone-200
        bg-[#f7f1e8]/95
        px-3
        pb-[calc(env(safe-area-inset-bottom)+8px)]
        pt-2
      "
      onSubmit={(event) => {
        event.preventDefault();
        submitMessage();
      }}
    >
      <div className="relative min-w-0 flex-1">
        <div
          className="
            absolute bottom-0 left-0 z-10
            flex h-[48px] w-[48px]
            items-center justify-center
          "
          aria-hidden={isComposerExpanded}
        >
          <button
            type="button"
            disabled={disabled}
            onClick={onOpenReflections}
            aria-label="Open reflections"
            title="Reflections"
            className="
              flex h-[48px] w-[48px]
              items-center justify-center
              rounded-full
              text-[26px]
              text-[#c7a84d]
              transition
              active:scale-90
              disabled:opacity-50
            "
          >
            <span aria-hidden="true">✨</span>
          </button>
        </div>

        <div
          className={`
            talkio-input
            relative z-20
            flex min-h-[48px] items-end
            overflow-hidden
            rounded-md
            border border-stone-300
            bg-white
            px-3 py-2
            transition-[margin] duration-200 ease-out
            ${
              isComposerExpanded
                ? "ml-0"
                : "ml-[52px]"
            }
          `}
        >
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
            onFocus={() => {
              setIsFocused(true);
            }}
            onBlur={() => {
              setIsFocused(false);
            }}
            onChange={(event) => {
              onChange(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submitMessage();
              }
            }}
            className="
              h-[32px] w-full
              resize-none
              border-0
              bg-transparent
              p-0
              text-[16px]
              leading-6
              outline-none
              placeholder:text-stone-400
              disabled:opacity-60
            "
            style={{
              borderRadius: "0px",
              WebkitAppearance: "none",
              appearance: "none",
              overflowY: "hidden",
            }}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSend}
        className="
          h-[48px] min-w-[64px]
          shrink-0
          rounded-md
          bg-[#78906f]
          px-4
          text-sm font-medium
          text-white
          transition
          active:scale-95
          disabled:opacity-50
        "
      >
        Send
      </button>
    </form>
  );
}

export default React.memo(ChatComposer);