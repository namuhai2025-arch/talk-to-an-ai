"use client";

import React from "react";

function TypingIndicator() {
  return (
    <div className="ml-4 mt-3 flex w-fit items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm">
      <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400" />
    </div>
  );
}

export default React.memo(TypingIndicator);