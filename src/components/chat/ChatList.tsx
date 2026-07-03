"use client";

import React from "react";

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
  bottomRef: React.RefObject<HTMLDivElement | null>;
};

function ChatList({ messages, isLimitReached, bottomRef }: ChatListProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 md:px-10">
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
            <div
              key={`${m.timestamp}-${i}`}
              className={[
                "max-w-[82%] whitespace-pre-wrap break-words rounded-3xl px-4 py-3 text-[15px] leading-7",
                m.role === "user"
                  ? "self-end bg-[#dfe8d2] text-stone-900"
                  : "self-start bg-white text-stone-800 shadow-sm",
                sameAsPrev ? "mt-1" : "mt-3",
                sameAsNext ? "mb-0" : "mb-2",
              ].join(" ")}
            >
              {m.content}

              {showTimestamp && (
                <div className="mt-2 text-[10px] text-stone-400">
                  {new Date(m.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default React.memo(ChatList);