"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
} from "react";

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
};

function ChatComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Type your message...",
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const maxHeightRef = useRef(320);

  const updateMaximumHeight = useCallback(() => {
    /*
     * Use the layout viewport rather than visualViewport.
     * visualViewport shrinks whenever the iOS keyboard opens.
     */
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

      /*
       * "auto" allows the textarea to contract after text is deleted
       * without briefly collapsing it to zero.
       */
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

  /*
   * Resize when text changes, including when the draft is cleared
   * after sending. requestAnimationFrame prevents synchronous layout
   * work from blocking every individual keystroke.
   */
  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  const trimmedValue = value.trim();
  const canSend = !disabled && trimmedValue.length > 0;

  const submitMessage = useCallback(() => {
    if (!canSend) return;
    onSend();
  }, [canSend, onSend]);

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
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submitMessage();
            }
          }}
          className="h-[32px] w-full resize-none border-0 bg-transparent p-0 text-[16px] leading-6 outline-none placeholder:text-stone-400 disabled:opacity-60"
          style={{
            borderRadius: "0px",
            WebkitAppearance: "none",
            appearance: "none",
            overflowY: "hidden",
          }}
        />
      </div>

      <button
        type="submit"
        disabled={!canSend}
        className="h-[48px] min-w-[64px] rounded-md bg-[#78906f] px-4 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}

export default React.memo(ChatComposer);