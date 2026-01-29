"use client";

import React, { useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type Mode = "supportive" | "open_chat";

const INITIAL_GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi, I’m Talkio. We can chat about anything — ideas, experiences, questions, or whatever’s on your mind.",
};

const MAX_MESSAGES = 10; // ~5 turns

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [crisisLock, setCrisisLock] = useState(false);
  const [mode, setMode] = useState<Mode>("supportive");
  
 useEffect(() => {
  function handleEsc(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setShowClearConfirm(false);
    }
  }

  window.addEventListener("keydown", handleEsc);
  return () => window.removeEventListener("keydown", handleEsc);
}, []);

  // ✅ Auto-scroll ref
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ✅ Auto-scroll when new bubbles are added
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
  if (!loading && !crisisLock) {
    inputRef.current?.focus();
  }
}, [loading, crisisLock, messages.length]);

  function clearChat() {
    setMessages([INITIAL_GREETING]);
    setInput("");
    setCrisisLock(false);
    setMode("supportive");
    setShowClearConfirm(false);
  }
  function isBlank(s: string) {
  return !s || !s.trim();
}

  async function sendMessage() {
    if (loading || crisisLock || isBlank(input)) return;
    const text = input.trim();


    setInput("");
    setLoading(true);

    // Build nextMessages from the latest state (avoids stale state bugs)
    let nextMessages: ChatMessage[] = [];
    setMessages((prev) => {
      nextMessages = [...prev, { role: "user", content: text }].slice(-MAX_MESSAGES);
      return nextMessages;
    });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mode,
          history: nextMessages,
        }),
      });

      const rawText = await res.text();
      if (!rawText) {
        throw new Error("Empty response from /api/chat");
      }

      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }

      if (!res.ok) {
        throw new Error(String(data?.error ?? `API error ${res.status}`));
      }

      // 🚨 Crisis reply
      if (data?.flagged === "crisis") {
        const crisisText = String(data?.reply ?? "").trim();

        setMessages((prev) => {
          const next = [
            ...prev,
            {
              role: "assistant" as const,
              content:
                crisisText ||
                "If you’re in danger, please contact local emergency services right now.",
            },
          ];
          return next.slice(-MAX_MESSAGES);
        });

        setCrisisLock(true);
        return;
      }

      // ✅ Normal reply
      const replyText = String(data?.reply ?? "").trim();
      if (!replyText) {
        throw new Error("Empty reply from /api/chat");
      }

      setMessages((prev) => {
        const next = [...prev, { role: "assistant" as const, content: replyText }];
        return next.slice(-MAX_MESSAGES);
      });
    } catch (err: any) {
      const msg =
        typeof err?.message === "string" && err.message
          ? err.message
          : "Sorry—something went wrong. Please try again.";

      setMessages((prev) => {
        const next = [...prev, { role: "assistant" as const, content: msg }];
        return next.slice(-MAX_MESSAGES);
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Talkio</h1>
          <p className="text-xs opacity-70">
            Talkio only remembers the most recent messages in this chat.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs opacity-70">Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              disabled={loading || crisisLock}
              className="rounded border px-2 py-1 text-sm"
            >
              <option value="supportive">Supportive</option>
              <option value="open_chat">Open Chat</option>
            </select>
          </div>

          {/* Clear chat */}
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="rounded border px-3 py-1 text-sm disabled:opacity-50"
            disabled={loading || crisisLock || messages.length <= 1}
            title="Clears this conversation and resets context"
          >
            Clear chat
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mt-4 rounded-xl border p-3 text-xs text-gray-700">
        <strong>Disclaimer:</strong> Talkio provides conversational support and information.
        It is not therapy, medical advice, or a crisis service. If you’re in immediate danger,
        contact local emergency services.
      </div>

      {/* 🔒 Chat paused banner */}
      {crisisLock && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          <strong>Chat paused for safety.</strong>
          <p className="mt-1 text-xs">
            Talkio can’t continue this conversation right now. If you’re in danger, please
            contact local emergency services or a trusted person. You can clear the chat to
            start over when you’re ready.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="mt-4 space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              "rounded-xl p-3 text-sm whitespace-pre-wrap " +
              (m.role === "user"
                ? "bg-black text-white"
                : "bg-gray-100 text-gray-900")
            }
          >
            {m.content}
          </div>
        ))}

        {/* ✅ Typing indicator */}
{loading && !crisisLock && (
  <div className="rounded-xl bg-gray-100 p-3 text-sm text-gray-900">
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-500" />
    </span>
  </div>
)}
        {/* ✅ Auto-scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="mt-4 flex gap-2">
        <input
          ref={inputRef}
          suppressHydrationWarning
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!loading && !crisisLock && !isBlank(input)) sendMessage();
            }
          }}
          autoComplete="off"
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
          placeholder={loading ? "Waiting for reply…" : "Type your message…"}
          disabled={loading || crisisLock}
        />
        <button
          suppressHydrationWarning
          onClick={sendMessage}
         disabled={loading || crisisLock || isBlank(input)}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {loading ? "Thinking…" : "Send"}
        </button>
      </div>

      {/* Clear chat confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded bg-white p-4 shadow">
            <h2 className="text-base font-semibold">Clear this chat?</h2>
            <p className="mt-1 text-sm opacity-80">
              This clears your current conversation and resets context.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border px-3 py-1 text-sm"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-black px-3 py-1 text-sm text-white"
                onClick={clearChat}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-gray-500">
        Talkio does not store long-term chat history. Conversations reset when cleared.
      </p>
    </main>
  );
}
