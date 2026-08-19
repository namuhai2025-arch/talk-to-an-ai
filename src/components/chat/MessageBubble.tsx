"use client";

import React, { useMemo, useRef, useState } from "react";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: number;
  isFeedbackPrompt?: boolean;
};

type MessageBubbleProps = {
  message: ChatMessage;
  sameAsPrev: boolean;
  sameAsNext: boolean;
  showTimestamp: boolean;
};

function MessageBubble({
  message,
  sameAsPrev,
  sameAsNext,
  showTimestamp,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  const [showCopyMenu, setShowCopyMenu] = useState(false);

  const longPressTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const touchStartPosition = useRef({
    x: 0,
    y: 0,
  });

  const didLongPress = useRef(false);

  const formattedTime = useMemo(() => {
    if (!showTimestamp) return "";

    return new Date(message.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [message.timestamp, showTimestamp]);

  const wrapperClassName = isUser
    ? "relative flex flex-col items-end"
    : "relative flex flex-col items-start";

  const bubbleClassName = [
    "whitespace-pre-wrap break-words px-4 py-3 text-[16.5px] leading-5.5",
    "select-none",
    "transition-all duration-150",
    showCopyMenu ? "ring-2 ring-stone-400/50" : "",
    isUser
      ? "mr-4 max-w-[74%] bg-[#dfe8d2] text-stone-900"
      : "ml-4 max-w-[74%] bg-red-300 text-stone-800 shadow-sm",
    sameAsPrev ? "mt-1" : "mt-3",
    sameAsNext ? "mb-0" : "mb-1",
    isUser
      ? "rounded-[28px] rounded-br-md"
      : "rounded-[28px] rounded-bl-md",
  ].join(" ");

  const timestampClassName = [
    "mt-1 text-[11px] text-stone-400",
    isUser ? "mr-5 text-right" : "ml-5 text-left",
  ].join(" ");

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = (
    event: React.TouchEvent<HTMLDivElement>,
  ) => {
    const touch = event.touches[0];

    touchStartPosition.current = {
      x: touch.clientX,
      y: touch.clientY,
    };

    didLongPress.current = false;

    clearLongPressTimer();

    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setShowCopyMenu(true);
    }, 450);
  };

  const handleTouchMove = (
    event: React.TouchEvent<HTMLDivElement>,
  ) => {
    const touch = event.touches[0];

    const deltaX = Math.abs(
      touch.clientX - touchStartPosition.current.x,
    );

    const deltaY = Math.abs(
      touch.clientY - touchStartPosition.current.y,
    );

    /*
     * Cancel the long press only when the user
     * is clearly scrolling.
     */
    if (deltaX > 12 || deltaY > 12) {
      clearLongPressTimer();
    }
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();
  };

  const copyMessage = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.content);
      } else {
        const textarea = document.createElement("textarea");

        textarea.value = message.content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        document.execCommand("copy");

        document.body.removeChild(textarea);
      }

      setShowCopyMenu(false);

      console.log("Message copied");
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
          setShowCopyMenu(true);
        }}
      >
        {message.content}
      </div>

      {showCopyMenu && (
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
        <div className={timestampClassName}>
          {formattedTime}
        </div>
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
    previous.message.isFeedbackPrompt ===
      next.message.isFeedbackPrompt &&
    previous.sameAsPrev === next.sameAsPrev &&
    previous.sameAsNext === next.sameAsNext &&
    previous.showTimestamp === next.showTimestamp
  );
}

export default React.memo(
  MessageBubble,
  areMessageBubblePropsEqual,
);