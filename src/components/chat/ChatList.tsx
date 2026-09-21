"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"; 
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: number;
  isFeedbackPrompt?: boolean;
  image?: {
    id: string;
    caption: string;
    width: number;
    height: number;
  };
};

type ChatListProps = {
  messages: ChatMessage[];
  isLimitReached?: boolean;
  showTyping: boolean;
  bottomRef?: React.RefObject<HTMLDivElement | null>;
};

const AUTO_SCROLL_THRESHOLD_PX = 140;

function ChatList({
  messages,
  isLimitReached = false,
  showTyping,
  bottomRef,
}: ChatListProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const internalBottomRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const [activeCopyMessage, setActiveCopyMessage] =
    useState<number | null>(null);

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

  // Track the newest message identity so session switches reliably trigger scrolling
  const latestMessageTimestamp = visibleMessages[visibleMessages.length - 1]?.timestamp || 0;
  const activeBottomRef = bottomRef || internalBottomRef;

  useEffect(() => {
    // Determine the active scrolling container (either this element or its scrollable parent in WorkspacePage)
    const container = scrollContainerRef.current?.parentElement || scrollContainerRef.current;
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
    if (visibleMessages.length === 0 && !showTyping) return;

    const scrollToNewest = () => {
      if (!shouldAutoScrollRef.current && visibleMessages.length > 1) return;

      // 1. Scroll direct container and parent container to bottom
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        if (scrollContainerRef.current.parentElement) {
          scrollContainerRef.current.parentElement.scrollTop =
            scrollContainerRef.current.parentElement.scrollHeight;
        }
      }

      // 2. Pin view instantly to bottom marker
      activeBottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    };

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    // Run on paint frame
    frameRef.current = window.requestAnimationFrame(() => {
      scrollToNewest();
      frameRef.current = null;
    });

    // Run slightly delayed backup to account for mobile keyboard pop or font reflow
    timeoutRef.current = window.setTimeout(() => {
      scrollToNewest();
      timeoutRef.current = null;
    }, 60);

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
  }, [visibleMessages.length, latestMessageTimestamp, showTyping, activeBottomRef]);

  return (
    <div
      ref={scrollContainerRef}
      className="min-h-0 w-full flex-1 touch-pan-y px-0 pb-4 pt-2"
      style={{ touchAction: "pan-y" }}
    >
      <div className="flex w-full flex-col gap-2">
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
              copyMenuOpen={activeCopyMessage === message.timestamp}
              onOpenCopyMenu={() => {
                setActiveCopyMessage(message.timestamp);
              }}
              onCloseCopyMenu={() => {
                setActiveCopyMessage(null);
              }}
            />
          );
        })}

        {showTyping && <TypingIndicator />}

        <div ref={activeBottomRef} className="h-px shrink-0" />
      </div>
    </div>
  );
}

export default React.memo(ChatList);