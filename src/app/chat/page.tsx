"use client";

import React, { useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type Mode = "supportive" | "open_chat";

const INITIAL_GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi, I’m Talkio 😊 What’s on your mind today — something fun, something heavy, or just a random thought?",
};

const MAX_MESSAGES = 10;

function isBlank(s: string) {
  return !s || !s.trim();
}

function getOrCreateSessionId() {
  if (typeof window === "undefined") return "server";

  let id = localStorage.getItem("talkio_session");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("talkio_session", id);
  }
    return (
    <main className="mx-auto max-w-2xl p-4 min-h-screen flex flex-col">
      <div className="space-y-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Talkio</h1>
        </div>

        {/* Chat bubbles */}
        <div className="flex-1 space-y-3 overflow-y-auto">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={[
                "max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow",
                m.role === "user"
                  ? "ml-auto bg-black text-white"
                  : "mr-auto bg-gray-100 text-gray-900",
              ].join(" ")}
            >
              {m.content}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input row */}
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={crisisLock ? "Chat locked for safety." : "Type your message..."}
            disabled={loading || crisisLock}
            className="flex-1 rounded-xl border px-3 py-2"
          />
          <button
            type="submit"
            disabled={loading || crisisLock || !input.trim()}
            className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? "..." : "Send"}
          </button>
          <button
            type="button"
            onClick={clearChat}
            disabled={loading || messages.length <= 1}
            className="rounded-xl border px-4 py-2 disabled:opacity-50"
          >
            Clear
          </button>
        </form>
      </div>
    </main>
  );
}

