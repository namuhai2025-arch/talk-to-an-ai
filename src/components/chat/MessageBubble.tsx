"use client";

import React, { useMemo } from "react";

type ChatRole = "user" | "assistant";

export type ChatAttachment = {
  name: string;
  mimeType: string;
  base64: string;
};

type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: number;
  isFeedbackPrompt?: boolean;
  attachments?: ChatAttachment[];
  attachment?: ChatAttachment | null;
};

type MessageBubbleProps = {
  message: ChatMessage;
  sameAsPrev: boolean;
  sameAsNext: boolean;
  showTimestamp: boolean;
  copyMenuOpen: boolean;
  onOpenCopyMenu: () => void;
  onCloseCopyMenu: () => void;
};

function MessageBubble({
  message,
  sameAsPrev,
  sameAsNext,
  showTimestamp,
  copyMenuOpen,
  onOpenCopyMenu,
  onCloseCopyMenu,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  const formattedDateTime = useMemo(() => {
    if (!showTimestamp) return "";
    const dateObj = new Date(message.timestamp);

    const dateStr = dateObj.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });

    const timeStr = dateObj.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `${dateStr} • ${timeStr}`;
  }, [message.timestamp, showTimestamp]);

  const copyMessage = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.content);
      }
      onCloseCopyMenu();
    } catch (error) {
      console.error("Failed to copy message:", error);
    }
  };

  const allAttachments: ChatAttachment[] = useMemo(() => {
    if (Array.isArray(message.attachments) && message.attachments.length > 0) {
      return message.attachments;
    }
    if (message.attachment) {
      return [message.attachment];
    }
    return [];
  }, [message.attachments, message.attachment]);

  // Prevent rendering empty bubble shells (fixes ghost boxes above timestamps)
  if (!message.content && allAttachments.length === 0) {
    return null;
  }

  return (
    <div 
      className={`relative flex flex-col ${isUser ? "items-end" : "items-start"} w-full my-1`}
      style={{ touchAction: "pan-y" }}
    >
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenCopyMenu();
        }}
        className={[
          // User bubble expands up to 85%, Assistant expands up to 96%
          isUser ? "max-w-[85%] md:max-w-[80%]" : "max-w-[96%] md:max-w-[94%]",
          "min-w-0 whitespace-pre-wrap break-words px-5 py-3 text-[15px] leading-relaxed",
          "select-text transition-all duration-150",
          copyMenuOpen ? "ring-2 ring-stone-400/50" : "",
          isUser
            ? "mr-1 rounded-[22px] rounded-br-sm bg-[#dfe8d2] text-stone-900"
            : "ml-1 rounded-[22px] rounded-tl-sm bg-white text-stone-800 shadow-xs border border-stone-200/60 dark:border-stone-800 dark:bg-[#212121] dark:text-stone-100",
          sameAsPrev ? "mt-1" : "mt-2",
          sameAsNext ? "mb-0" : "mb-1",
        ].join(" ")}
        style={{ touchAction: "pan-y" }}
      >
        {/* Attachments preview grid */}
        {allAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {allAttachments.map((att, idx) => (
              <div key={idx} className="overflow-hidden rounded-lg">
                {att.mimeType?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:${att.mimeType};base64,${att.base64}`}
                    alt={att.name || "Attachment"}
                    className="max-h-80 max-w-full rounded-lg object-contain pointer-events-none"
                  />
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-xs font-medium text-stone-700 dark:bg-white/10 dark:text-stone-200">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="truncate max-w-[240px]">{att.name}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Text Content */}
        {message.content && (
          <div className="w-full min-w-0 select-text font-normal break-words">
            {message.content}
          </div>
        )}
      </div>

      {copyMenuOpen && (
        <button
          type="button"
          onClick={copyMessage}
          className={[
            "z-20 mt-1 rounded-lg bg-white dark:bg-stone-800",
            "px-3 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-200",
            "shadow-md border border-stone-200 dark:border-stone-700",
            isUser ? "mr-4" : "ml-4",
          ].join(" ")}
        >
          Copy
        </button>
      )}

      {showTimestamp && (
        <div
          className={`mt-0.5 text-[11px] text-stone-400 ${
            isUser ? "mr-3 text-right" : "ml-3 text-left"
          }`}
        >
          {formattedDateTime}
        </div>
      )}
    </div>
  );
}

export default React.memo(MessageBubble);