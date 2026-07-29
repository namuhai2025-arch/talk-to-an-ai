"use client";

import React, { useEffect, useMemo, useRef } from "react";
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

const AUTO_SCROLL_THRESHOLD_PX = 140;

function ChatList({
  messages,
  isLimitReached,
  showTyping,
  bottomRef,
}: ChatListProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const visibleMessages = useMemo(() => {
    return messages.filter((message) => {
      return !(
        isLimitReached &&
        message.role === "assistant" &&
        typeof message.content === "string" &&
        message.content.includes("free limit")
      );
    });
  }, [messages, isLimitReached]);

  useEffect(() => {
    const container = scrollContainerRef.current;

    if (!container) return;

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight -
        container.scrollTop -
        container.clientHeight;

      shouldAutoScrollRef.current =
        distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX;
    };

    container.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;

    if (!container || visibleMessages.length === 0) return;

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    frameRef.current = window.requestAnimationFrame(() => {
      if (shouldAutoScrollRef.current) {
        container.scrollTop = container.scrollHeight;
      }

      frameRef.current = null;
    });

    timeoutRef.current = window.setTimeout(() => {
      if (shouldAutoScrollRef.current) {
        container.scrollTop = container.scrollHeight;
      }

      timeoutRef.current = null;
    }, 100);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [visibleMessages.length, showTyping]);

  return (
    <div
      ref={scrollContainerRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2 md:px-10"
    >
      <div className="flex flex-col gap-2">
        {visibleMessages.map((message, index) => {
          const previous = visibleMessages[index - 1];
          const next = visibleMessages[index + 1];

          const sameAsPrev = previous?.role === message.role;
          const sameAsNext = next?.role === message.role;
          const showTimestamp = !next || next.role !== message.role;

          return (
            <MessageBubble
              key={`${message.timestamp}-${index}`}
              message={message}
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