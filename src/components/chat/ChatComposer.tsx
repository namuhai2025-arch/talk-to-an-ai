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
  attachment?: File | null;
  onAttachmentChange?: (file: File | null) => void;
  canAttach?: boolean;
  imageSendingReady?: boolean;
  attachmentStatus?: string;
};

function ChatComposer({
  value,
  onChange,
  onSend,
  onOpenReflections,
  disabled = false,
  placeholder = "Type your message...",
  attachment = null,
  onAttachmentChange,
  canAttach = false,
  imageSendingReady = false,
  attachmentStatus = "",
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const maxHeightRef = useRef(320);

  const [isFocused, setIsFocused] = useState(false);
  const [preview, setPreview] = useState<{
    file: File;
    url: string;
  } | null>(null);
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    setFileError("");

    if (!attachment) {
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(attachment);
    setPreview({ file: attachment, url });

    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  const updateMaximumHeight = useCallback(() => {
    maxHeightRef.current = Math.max(
      144,
      Math.min(window.innerHeight * 0.48, 320),
    );
  }, []);

  const resizeTextarea = useCallback(() => {
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;

      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.style.height = "auto";

      const contentHeight = textarea.scrollHeight;

      textarea.style.height = `${Math.max(
        32,
        Math.min(contentHeight, maxHeightRef.current),
      )}px`;

      textarea.style.overflowY =
        contentHeight > maxHeightRef.current
          ? "auto"
          : "hidden";

      if (contentHeight <= maxHeightRef.current) {
        textarea.scrollTop = 0;
      }
    });
  }, []);

  useEffect(() => {
    const resize = () => {
      updateMaximumHeight();
      resizeTextarea();
    };

    resize();

    window.addEventListener("resize", resize, {
      passive: true,
    });

    return () => {
      window.removeEventListener("resize", resize);

      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
    };
  }, [resizeTextarea, updateMaximumHeight]);

  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  const hasAttachment = attachment !== null;

  const canSend =
    !disabled &&
    (value.trim().length > 0 || hasAttachment);

  const expanded =
    isFocused || value.length > 0 || hasAttachment;

  const submitMessage = () => {
    if (canSend) onSend();
  };

  const chooseFile = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];

    // Allows selecting the same file again after removing it.
    event.currentTarget.value = "";

    if (
      !file ||
      disabled ||
      !canAttach ||
      !onAttachmentChange
    ) {
      return;
    }

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        file.type,
      )
    ) {
      setFileError(
        "Please choose a JPEG, PNG, or WebP image.",
      );
      return;
    }

    if (
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    ) {
      setFileError(
        "Please choose an image under 10 MB that is not empty.",
      );
      return;
    }

    setFileError("");
    onAttachmentChange(file);
  };

  return (
    <form
      className="
        relative z-40 shrink-0
        border-t border-stone-200
        bg-[#f7f1e8]/95 px-3
        pb-[calc(env(safe-area-inset-bottom)+8px)]
        pt-2
      "
      onSubmit={(event) => {
        event.preventDefault();
        submitMessage();
      }}
    >
      {hasAttachment && (
        <div
          className="
            mb-2 flex items-center gap-3
            rounded-lg border border-stone-200
            bg-white p-2
          "
        >
          {preview?.file === attachment && (
            // Local preview only; this does not upload the file.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt="Selected attachment"
              width={64}
              height={64}
              className="h-16 w-16 rounded-md object-cover"
              onError={() =>
                setFileError(
                  "This image could not be previewed. Please choose another image.",
                )
              }
            />
          )}

          <span className="min-w-0 flex-1 truncate text-sm text-stone-600">
            {attachment.name}
          </span>

          <button
            type="button"
            disabled={disabled}
            aria-label="Remove image"
            onClick={() => {
              onAttachmentChange?.(null);
              setFileError("");
            }}
            className="
              min-h-11 px-3 text-sm
              text-stone-700 disabled:opacity-50
            "
          >
            Remove
          </button>
        </div>
      )}

      {fileError && (
        <p
          role="alert"
          className="mb-2 text-sm text-red-700"
        >
          {fileError}
        </p>
      )}

      <div className="flex items-end gap-2">
        {onAttachmentChange && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={chooseFile}
              disabled={disabled || !canAttach}
            />

            <button
              type="button"
              aria-label="Attach image"
              title="Attach image"
              disabled={disabled || !canAttach}
              onClick={() => fileInputRef.current?.click()}
              className="
                flex h-12 w-11 shrink-0
                items-center justify-center rounded-md
                text-[#58704f] disabled:opacity-40
              "
            >
              <svg
                width="23"
                height="23"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="3"
                />
                <circle cx="8" cy="8" r="1.5" />
                <path d="m3 17 5-5 4 4 4-6 5 7" />
              </svg>
            </button>
          </>
        )}

        <div className="relative min-w-0 flex-1">
          <div
            className="
              absolute bottom-0 left-0 z-10
              flex h-12 w-12 items-center justify-center
            "
            aria-hidden={expanded}
          >
            <button
              type="button"
              disabled={disabled || expanded}
              tabIndex={expanded ? -1 : 0}
              onClick={onOpenReflections}
              aria-label="Open reflections"
              title="Reflections"
              className="
                flex h-12 w-12
                items-center justify-center rounded-full
                text-[26px] text-[#c7a84d]
                transition active:scale-90
                disabled:opacity-50
              "
            >
              <span aria-hidden="true">✨</span>
            </button>
          </div>

          <div
            className={`
              talkio-input relative z-20
              flex min-h-[48px] items-end
              overflow-hidden rounded-md
              border border-stone-300 bg-white
              px-3 py-2
              transition-[margin] duration-200 ease-out
              ${expanded ? "ml-0" : "ml-[52px]"}
            `}
          >
            <textarea
              ref={textareaRef}
              value={value}
              rows={1}
              disabled={disabled}
              aria-label="Message"
              placeholder={placeholder}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              autoComplete="off"
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onChange={(event) =>
                onChange(event.currentTarget.value)
              }
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
                h-[32px] w-full resize-none
                border-0 bg-transparent p-0
                text-[16px] leading-6 outline-none
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
            h-12 min-w-[64px] shrink-0
            rounded-md bg-[#78906f] px-4
            text-sm font-medium text-white
            transition active:scale-95
            disabled:opacity-50
          "
        >
          Send
        </button>
      </div>
    </form>
  );
}

export default React.memo(ChatComposer);