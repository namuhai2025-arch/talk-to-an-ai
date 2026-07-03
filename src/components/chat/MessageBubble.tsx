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
  const isUser = message.role === "user";

  return (
    <div className={["flex flex-col", isUser ? "items-end" : "items-start"].join(" ")}>
      <div
        className={[
          "whitespace-pre-wrap break-words px-4 py-3 text-[15px] leading-5.5",
          isUser
            ? "mr-4 max-w-[74%] bg-[#dfe8d2] text-stone-900"
            : "ml-4 max-w-[74%] bg-white text-stone-800 shadow-sm",
          sameAsPrev ? "mt-1" : "mt-3",
          sameAsNext ? "mb-0" : "mb-1",
          isUser
            ? "rounded-[28px] rounded-br-md"
            : "rounded-[28px] rounded-bl-md",
        ].join(" ")}
      >
        {message.content}
      </div>

      {showTimestamp && (
        <div
          className={[
            "mt-1 text-[11px] text-stone-400",
            isUser ? "mr-5 text-right" : "ml-5 text-left",
          ].join(" ")}
        >
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