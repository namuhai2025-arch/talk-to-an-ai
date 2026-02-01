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
  return id;
}

export default function ChatPage() {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [INITIAL_GREETING];

    const sessionId = getOrCreateSessionId();
    const saved = localStorage.getItem(`talkio_messages_${sessionId}`);

    try {
      return saved ? (JSON.parse(saved) as ChatMessage[]) : [INITIAL_GREETING];
    } catch {
      return [INITIAL_GREETING];
    }
  });

  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "supportive";
    const sessionId = getOrCreateSessionId();
    const saved = localStorage.getItem(`talkio_mode_${sessionId}`);
    return (saved as Mode) || "supportive";
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [crisisLock, setCrisisLock] = useState(false);

  // Persist messages per session
  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    localStorage.setItem(`talkio_messages_${sessionId}`, JSON.stringify(messages));
  }, [messages]);

  // Persist mode per session
  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    localStorage.setItem(`talkio_mode_${sessionId}`, mode);
  }, [mode]);

  // Autoscroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Autofocus input
  useEffect(() => {
    if (!loading && !crisisLock) inputRef.current?.focus();
  }, [loading, crisisLock, messages.length]);

  function clearChat() {
    setLoading(false);

    // New session id
    const newId = crypto.randomUUID();
    localStorage.setItem("talkio_session", newId);

    setMessages([INITIAL_GREETING]);
    setInput("");
    setCrisisLock(false);
    setMode("supportive");
  }

  async function sendMessage() {
    if (loading || crisisLock || isBlank(input)) return;

    const text = input.trim();
    const userMsg: ChatMessage = { role: "user", content: text };

    const nextMessages: ChatMessage[] = [...messages, userMsg].slice(-MAX_MESSAGES);

    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    const sessionId = getOrCreateSessionId();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: text,
          mode,
          history: nextMessages,
        }),
      });

      const rawText = await res.text();
      if (!rawText) throw new Error("Empty response from /api/chat");

      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }

      if (!res.ok) {
        throw new Error(String(data?.error ?? `API error ${res.status}`));
      }

      if (data?.flagged === "crisis") {
        const crisisText = String(data?.reply ?? "").trim();
        setMessages((prev) =>
          [...prev, { role: "assistant", content: crisisText || "Please contact local emergency services right now." }].slice(
            -MAX_MESSAGES
          )
        );
        setCrisisLock(true);
        return;
      }

      const replyText = String(data?.reply ?? "").trim();
      if (!replyText) throw new Error("Empty reply from /api/chat");

      setMessages((prev) => [...prev, { role: "assistant", content: replyText }].slice(-MAX_MESSAGES));
    } catch (err: any) {
      const raw = String(err?.message || "");
      const msg =
        raw.includes("429") || raw.toLowerCase().includes("quota")
          ? "Oops — I hit my daily message limit right now 😅 Please try again later."
          : "Sorry — something went wrong. Please try again.";

      setMessages((prev) => [...prev, { role: "assistant", content: msg }].slice(-MAX_MESSAGES));
    } finally {
      setLoading(false);
    }
  }

 return (
  <main className="mx-auto max-w-2xl p-4 min-h-screen flex flex-col">
    <div className="space-y-4 flex-1">
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
      </div>   {/* ← THIS WAS MISSING */}

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
  </div>
</div>
  <div ref={bottomRef} />
</main>
);
}