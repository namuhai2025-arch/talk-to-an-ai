"use client";

import React from "react";

export default function TypingIndicator() {
  return (
    <div className="ml-4 mt-2 flex w-fit items-center gap-1.5 rounded-[20px] bg-white px-4 py-3 shadow-sm dark:bg-[#232323]">
      <span
        className="h-2 w-2 rounded-full bg-stone-400 animate-pulse dark:bg-stone-500"
        style={{ animationDuration: "600ms", animationDelay: "0ms" }}
      />
      <span
        className="h-2 w-2 rounded-full bg-stone-400 animate-pulse dark:bg-stone-500"
        style={{ animationDuration: "600ms", animationDelay: "150ms" }}
      />
      <span
        className="h-2 w-2 rounded-full bg-stone-400 animate-pulse dark:bg-stone-500"
        style={{ animationDuration: "600ms", animationDelay: "300ms" }}
      />
    </div>
  );
}