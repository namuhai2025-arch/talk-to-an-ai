"use client";

import React, { useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const INITIAL_GREETING: ChatMessage = {
  role: "assistant",
  content: "Hi, I’m Talkio. What’s on your mind today?",
};

const MAX_MESSAGES = 10;

function getOrCreateSessionId() {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("talkio_session");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("talkio_session", id);
  }
  return id;
}

export default function Page() {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [crisisLock, setCrisisLock] = useState(false);
  const [input, setInput] = useState("");
  const [showSafety, setShowSafety] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [INITIAL_GREETING];

    const sessionId = getOrCreateSessionId();
    const saved = localStorage.getItem(`talkio_messages_${sessionId}`);
    if (!saved) return [INITIAL_GREETING];

    try {
      const parsed = JSON.parse(saved);
      const safe: ChatMessage[] = Array.isArray(parsed)
        ? parsed
            .filter(
              (m: any) =>
                m &&
                (m.role === "user" || m.role === "assistant") &&
                typeof m.content === "string"
            )
            .slice(-MAX_MESSAGES)
        : [];

      return safe.length ? safe : [INITIAL_GREETING];
    } catch {
      return [INITIAL_GREETING];
    }
  });

  // Save messages locally (per session)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const sessionId = getOrCreateSessionId();
    localStorage.setItem(`talkio_messages_${sessionId}`, JSON.stringify(messages));
  }, [messages]);

  // Show Safety / Disclaimer once on first launch (per device)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const acknowledged = localStorage.getItem("talkio_safety_acknowledged");
    if (!acknowledged) setShowSafety(true);
  }, []);

  // Keep scroll pinned to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function clearChat() {
    setCrisisLock(false);
    setMessages([INITIAL_GREETING]);
    setInput("");
    inputRef.current?.focus();
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading || crisisLock) return;

    setLoading(true);
    setInput("");

    const next: ChatMessage[] = [
      ...messages,
      { role: "user" as const, content: text },
    ].slice(-MAX_MESSAGES);

    setMessages(next);

    try {
      const sessionId = getOrCreateSessionId();

      const res = await fetch("https://talk-to-an-ai.vercel.app/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: next,
          sessionId,
        }),
      });

      const rawText = await res.text();

      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }

      if (!res.ok) {
        throw new Error(String(data?.error ?? rawText ?? `API error ${res.status}`));
      }

      const replyText =
        typeof data?.reply === "string" ? data.reply : "Sorry — something went wrong.";

      if (data?.flagged === "crisis") setCrisisLock(true);

      setMessages((prev) =>
        [...prev, { role: "assistant" as const, content: replyText }].slice(-MAX_MESSAGES)
      );
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      const isRateLimit =
        msg.includes("429") ||
        msg.toLowerCase().includes("too many requests") ||
        msg.toLowerCase().includes("quota");

      const friendlyMessage = "ERR: " + msg;
        ? "I’m still here. I just need a short moment before I can reply again. Please try again in a bit."
        : "Something went wrong on my end. Please try again.";

      console.error("Chat error:", err);

      setMessages((prev) =>
        [...prev, { role: "assistant" as const, content: friendlyMessage }].slice(-MAX_MESSAGES)
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  // ✅ RETURN MUST BE HERE (outside sendMessage)
  return (
    <main className="mx-auto max-w-2xl p-4 text-[14px] leading-[20px] font-normal antialiased">
      {showSafety && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-xl bg-white p-6 text-sm leading-relaxed shadow-lg">
            <h2 className="mb-3 text-lg font-semibold">Safety & Disclaimer</h2>

            <p className="mb-2">
              Talkio is an AI conversation tool designed for casual conversation and emotional
              support. It is not a therapist, doctor, or emergency service.
            </p>

            <p className="mb-2">
              If you are in distress or feel unsafe, please seek help from local emergency services
              or a qualified professional.
            </p>

            <p className="mb-4">
              By continuing, you understand and agree to use Talkio at your own discretion.
            </p>

            <button
              type="button"
              className="w-full rounded-lg bg-black px-4 py-2 text-white"
              onClick={() => {
                localStorage.setItem("talkio_safety_acknowledged", "true");
                setShowSafety(false);
              }}
            >
              I understand
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Talkio</h1>

          <button
            type="button"
            onClick={clearChat}
            disabled={loading || messages.length <= 1}
            className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
          >
            Clear chat
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto text-base">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={[
                "max-w-[80%] rounded-2xl px-4 py-3 leading-relaxed shadow-sm",
                m.role === "user"
                  ? "ml-auto bg-emerald-400 text-white"
                  : "mr-auto bg-stone-100 text-stone-900",
              ].join(" ")}
            >
              {m.content}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

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
        </form>
      </div>
    </main>
  );
}
