import { RefObject, useEffect } from "react";

type UseAutoScrollOptions = {
  bottomRef: RefObject<HTMLDivElement | null>;
  messageCount: number;
  showTyping: boolean;
  mounted: boolean;
};

export function useAutoScroll({
  bottomRef,
  messageCount,
  showTyping,
  mounted,
}: UseAutoScrollOptions) {
  useEffect(() => {
    if (!mounted) return;

    const timer = window.setTimeout(() => {
      bottomRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [messageCount, showTyping, mounted, bottomRef]);
}