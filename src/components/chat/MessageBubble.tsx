"use client";

import React from "react";

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
  return (
    <div
      className={[
        "max-w-[82%] whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-[15px] leading-7",
        message.role === "user"
          ? "self-end bg-[#dfe8d2] text-stone-900"
          : "self-start bg-white text-stone-800 shadow-sm",
        sameAsPrev ? "mt-1" : "mt-3",
        sameAsNext ? "mb-0" : "mb-2",
      ].join(" ")}
    >
      {message.content}

      {showTimestamp && (
        <div className="mt-2 text-[10px] text-stone-400">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      )}
    </div>
  );
}

export default React.memo(MessageBubble);