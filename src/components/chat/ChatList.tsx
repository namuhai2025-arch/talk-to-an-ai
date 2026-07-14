"use client";

import React from "react";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: number;
  isFeedbackPrompt?: boolean;
};

type ChatListProps = {
  messages: ChatMessage[];
  isLimitReached: boolean;
  showTyping: boolean;
  bottomRef: React.RefObject<HTMLDivElement | null>;
};

function ChatList({
  messages,
  isLimitReached,
  showTyping,
  bottomRef,
}: ChatListProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2 md:px-10">
      <div className="flex flex-col gap-2">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];

          const sameAsPrev = prev?.role === m.role;
          const sameAsNext = next?.role === m.role;
          const showTimestamp = !next || next.role !== m.role;

          if (
            isLimitReached &&
            m.role === "assistant" &&
            typeof m.content === "string" &&
            m.content.includes("free limit")
          ) {
            return null;
          }

          return (
            <MessageBubble
              key={`${m.timestamp}-${i}`}
              message={m}
              sameAsPrev={sameAsPrev}
              sameAsNext={sameAsNext}
              showTimestamp={showTimestamp}
            />
          );
        })}

        {showTyping && <TypingIndicator />}

        <div ref={bottomRef} className="h-px shrink-0" />
      </div>
    </div>
  );
}

export default React.memo(ChatList);