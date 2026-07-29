"use client";

import React, { useMemo } from "react";

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

  const formattedTime = useMemo(() => {
    if (!showTimestamp) return "";

    return new Date(message.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [message.timestamp, showTimestamp]);

  const wrapperClassName = isUser
    ? "flex flex-col items-end"
    : "flex flex-col items-start";

  const bubbleClassName = [
    "whitespace-pre-wrap break-words px-4 py-3 text-[16.5px] leading-5.5",
    isUser
      ? "mr-4 max-w-[74%] bg-[#dfe8d2] text-stone-900"
      : "ml-4 max-w-[74%] bg-white text-stone-800 shadow-sm",
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

  return (
    <div className={wrapperClassName}>
      <div className={bubbleClassName}>{message.content}</div>

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