import { RefObject, useEffect } from "react";

type UseAutoScrollOptions = {
  bottomRef: RefObject<HTMLDivElement | null>;
  messages: unknown[];
  showTyping: boolean;
  mounted: boolean;
};

export function useAutoScroll({
  bottomRef,
  messages,
  showTyping,
  mounted,
}: UseAutoScrollOptions) {
  useEffect(() => {
    if (!mounted) return;

    const scrollToBottom = () => {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    };

    const timers = [
      window.setTimeout(scrollToBottom, 80),
      window.setTimeout(scrollToBottom, 250),
      window.setTimeout(scrollToBottom, 500),
    ];

    let resizeTimer: number | undefined;

    const handleResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(scrollToBottom, 120);
    };

    window.visualViewport?.addEventListener("resize", handleResize);
    window.addEventListener("resize", handleResize);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      if (resizeTimer) window.clearTimeout(resizeTimer);
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.removeEventListener("resize", handleResize);
    };
  }, [bottomRef, messages, showTyping, mounted]);
}