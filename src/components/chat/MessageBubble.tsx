"use client";

import React, { useMemo, useRef } from "react";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: number;
  isFeedbackPrompt?: boolean;
  imageUrl?: string;
  image?: {
    id: string;
    caption: string;
    width: number;
    height: number;
  };
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

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosition = useRef({ x: 0, y: 0 });
  const didLongPress = useRef(false);

  const formattedTime = useMemo(() => {
    if (!showTimestamp) return "";
    return new Date(message.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [message.timestamp, showTimestamp]);

  const wrapperClassName = isUser
    ? "relative flex flex-col items-end w-full"
    : "relative flex flex-col items-start w-full";

  const bubbleClassName = [
    "whitespace-pre-wrap break-words px-4 py-3 text-[16.5px] leading-5.5",
    "select-none transition-all duration-150",
    copyMenuOpen ? "ring-2 ring-stone-400/50" : "",
    isUser
      ? "mr-4 max-w-[74%] bg-[#dfe8d2] text-stone-900"
      : "ml-4 max-w-[74%] bg-white text-stone-800 shadow-sm",
    sameAsPrev ? "mt-0.5" : "mt-2",
    sameAsNext ? "mb-0" : "mb-0.5",
    isUser ? "rounded-[24px] rounded-br-md" : "rounded-[24px] rounded-bl-md",
  ].join(" ");

  const timestampClassName = [
    "mt-0.5 text-[11px] text-stone-400",
    isUser ? "mr-5 text-right" : "ml-5 text-left",
  ].join(" ");

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartPosition.current = { x: touch.clientX, y: touch.clientY };
    didLongPress.current = false;
    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onOpenCopyMenu();
    }, 450);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosition.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosition.current.y);
    if (deltaX > 12 || deltaY > 12) clearLongPressTimer();
  };

  const handleTouchEnd = () => clearLongPressTimer();

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      onCloseCopyMenu();
    } catch (error) {
      console.error("Failed to copy message:", error);
    }
  };

  return (
    <div className={wrapperClassName}>
      <div
        className={bubbleClassName}
        style={{
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
        onTouchStart={startLongPress}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenCopyMenu();
        }}
      >
        {/* IMAGE DISPLAY SECTION */}
        {message.imageUrl && (
          <div className="mb-2 -mx-1 overflow-hidden rounded-xl border border-black/5">
            <img 
              src={message.imageUrl} 
              alt="Visual attachment" 
              className="w-full h-auto block max-h-[300px] object-cover"
            />
          </div>
        )}

        {/* MESSAGE TEXT */}
        {message.content}
      </div>

      {copyMenuOpen && (
        <button
          type="button"
          onClick={copyMessage}
          className={[
            "z-20 mt-1 rounded-xl bg-white",
            "px-4 py-2 text-sm font-medium text-stone-800",
            "shadow-lg border border-stone-200",
            isUser ? "mr-4" : "ml-4",
          ].join(" ")}
        >
          Copy
        </button>
      )}

      {showTimestamp && (
        <div className={timestampClassName}>{formattedTime}</div>
      )}
    </div>
  );
}

function areMessageBubblePropsEqual(
  previous: MessageBubbleProps,
  next: MessageBubbleProps,
) {
  return (
    previous.message.role === next.message.role &&
    previous.message.content === next.message.content &&
    previous.message.timestamp === next.message.timestamp &&
    previous.message.imageUrl === next.message.imageUrl && // ADDED THIS
    previous.message.isFeedbackPrompt === next.message.isFeedbackPrompt &&
    previous.sameAsPrev === next.sameAsPrev &&
    previous.sameAsNext === next.sameAsNext &&
    previous.showTimestamp === next.showTimestamp &&
    previous.copyMenuOpen === next.copyMenuOpen
  );
}

export default React.memo(MessageBubble, areMessageBubblePropsEqual);