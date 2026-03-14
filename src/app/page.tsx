"use client";

import React, { useEffect, useRef, useState } from "react";

const MAX_MESSAGES = 30;
const MEMORY_KEY = "talkio_memory_v1";
const LOCAL_SESSION_KEY = "talkio_local_session_id_v1";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: number;
};

type TalkioMemory = {
  mood?: string;
  updatedAt?: number;
  conversationSummary?: string;
  summaryBaseCount?: number;
  summaryUpdatedAt?: number;
};

const EMOJIS = ["🙂", "😊", "😄", "😅", "😂", "🥲", "😍", "😢", "😡", "👍", "❤️", "✨"];

function loadMemory(): TalkioMemory {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function persistMemory(mem: TalkioMemory) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
  } catch {}
}

function getOrCreateAnonymousId() {
  if (typeof window === "undefined") return "";

  let id = localStorage.getItem("talkio_anonymous_id");

  if (!id) {
    id =
      "anon_" +
      Math.random().toString(36).slice(2) +
      Date.now().toString(36);

    localStorage.setItem("talkio_anonymous_id", id);
  }

  return id;
}

function getOrCreateLocalSessionId() {
  try {
    let id = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!id) {
      id =
        (globalThis.crypto?.randomUUID?.() ??
          `sid_${Date.now()}_${Math.random()}`) + "";
      localStorage.setItem(LOCAL_SESSION_KEY, id);
    }
    return id;
  } catch {
    (globalThis as any).__talkio_local_sid ??= `sid_${Date.now()}_${Math.random()}`;
    return (globalThis as any).__talkio_local_sid as string;
  }
}

function buildConversationTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user" && m.content.trim());

  if (!firstUser) return "New conversation";

  const text = firstUser.content.trim().replace(/\s+/g, " ");
  if (text.length <= 36) return text;
  return text.slice(0, 36).trim() + "...";
}

function buildGreeting(displayName: string): ChatMessage {
  const name = (displayName || "").trim();

  return {
    role: "assistant" as const,
    content: name
      ? `Hey ${name}, I'm Talkio.\n\nYou can talk to me about anything — something good, something stressful, or even if you're just bored.`
      : `Hey, I'm Talkio.\n\nYou can talk to me about anything — something good, something stressful, or even if you're just bored.`,
    timestamp: Date.now(),
  };
}

function inferMood(text: string): string | "" {
  const t = (text || "").toLowerCase();

  const rules: Array<[string, RegExp[]]> = [
    ["anxious", [/anxious|panic|panicking|worried|overthinking|nervous/]],
    ["stressed", [/stress|stressed|overwhelmed|pressure|burnout/]],
    ["sad", [/sad|down|cry|crying|lonely|heartbroken|depressed/]],
    ["angry", [/angry|mad|furious|annoyed|pissed/]],
    ["tired", [/tired|exhausted|sleepy|no sleep|can't sleep|insomnia/]],
    ["okay", [/okay|fine|alright|better now|i'm good|im good/]],
    ["happy", [/happy|excited|grateful|great day|so good/]],
  ];

  for (const [label, patterns] of rules) {
    if (patterns.some((re) => re.test(t))) return label;
  }

  return "";
}

export default function Page() {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const [memory, setMemory] = useState<TalkioMemory>({});
  const [loading, setLoading] = useState(false);
  const [crisisLock, setCrisisLock] = useState(false);
  const [isLimitReached, setIsLimitReached] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(false);

  const [input, setInput] = useState("");
  const [showSafety, setShowSafety] = useState(false);
  const [conversationTitle, setConversationTitle] = useState("New conversation");

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [anonymousId, setAnonymousId] = useState("");
  const [showTyping, setShowTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([buildGreeting("")]);

  const greeting = buildGreeting(displayName);

  function saveMemoryUpdate(data: Partial<TalkioMemory>) {
    setMemory((prev) => {
      const next = { ...prev, ...data };
      persistMemory(next);
      return next;
    });
  }

  function saveNickname(name: string) {
    const clean = name.trim();
    setDisplayName(clean);

    if (typeof window !== "undefined") {
      localStorage.setItem("talkio_nickname", clean);
    }
  }

  function handleSaveNickname() {
    saveNickname(displayName);
    setShowNamePrompt(false);
  }

  function addEmoji(emoji: string) {
    setInput((prev) => prev + emoji);

    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
        inputRef.current.style.height = inputRef.current.scrollHeight + "px";
        inputRef.current.focus();
      }
    });
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedNick = localStorage.getItem("talkio_nickname") || "";
    if (savedNick.trim()) {
      setDisplayName(savedNick);
      setShowNamePrompt(false);
    } else {
      setShowNamePrompt(true);
    }
  }, []);

  useEffect(() => {
    setMemory(loadMemory());
  }, []);

  useEffect(() => {
    setAnonymousId(getOrCreateAnonymousId());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const localSid = getOrCreateLocalSessionId();
    const saved = localStorage.getItem(`talkio_messages_${localSid}`);

    if (!saved) {
      setMessages([buildGreeting(displayName)]);
      return;
    }

    try {
      const parsed = JSON.parse(saved);

      const normalized: ChatMessage[] = Array.isArray(parsed)
        ? parsed
            .filter(
              (m: any) =>
                m &&
                (m.role === "user" || m.role === "assistant") &&
                typeof m.content === "string"
            )
            .map((m: any, i: number) => ({
              role: m.role,
              content: m.content,
              timestamp:
                typeof m.timestamp === "number" ? m.timestamp : Date.now() + i,
            }))
            .slice(-MAX_MESSAGES)
        : [];

      setMessages(normalized.length ? normalized : [buildGreeting(displayName)]);
    } catch {
      setMessages([buildGreeting(displayName)]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const localSid = getOrCreateLocalSessionId();
    const savedTitle = localStorage.getItem(`talkio_title_${localSid}`);

    if (savedTitle) {
      setConversationTitle(savedTitle);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const localSid = getOrCreateLocalSessionId();
    localStorage.setItem(`talkio_title_${localSid}`, conversationTitle);
  }, [conversationTitle]);

  useEffect(() => {
    setMessages((prev) => {
      if (!prev.length) return [greeting];

      const first = prev[0];
      const isOurGreeting =
        first.role === "assistant" &&
        (first.content.startsWith("Hey") ||
          first.content.includes("You can talk to me about anything"));

      if (!isOurGreeting) return prev;

      return [greeting, ...prev.slice(1)];
    });
  }, [displayName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const localSid = getOrCreateLocalSessionId();
    localStorage.setItem(`talkio_messages_${localSid}`, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const acknowledged = localStorage.getItem("talkio_safety_acknowledged");
    if (!acknowledged) setShowSafety(true);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, showTyping]);

  function clearChat() {
    setCrisisLock(false);
    setIsLimitReached(false);
    setConversationTitle("New conversation");
    setMessages([greeting]);
    setInput("");
    inputRef.current?.focus();
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || loading || crisisLock || isLimitReached) return;

    setLoading(true);
    setShowTyping(false);

    const typingTimer = setTimeout(() => {
      setShowTyping(true);
    }, 300);

    if (!overrideText) {
      setInput("");
    }

    const next: ChatMessage[] = [
  ...messages,
  {
    role: "user" as const,
    content: text,
    timestamp: Date.now(),
  },
].slice(-MAX_MESSAGES);

    setMessages(next);

    if (conversationTitle === "New conversation") {
      setConversationTitle(buildConversationTitle(next));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const mood = inferMood(text);
    const nextMemory: TalkioMemory = mood
      ? { ...memory, mood, updatedAt: Date.now() }
      : memory;

    if (mood) {
      setMemory(nextMemory);
      persistMemory(nextMemory);
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          anonymousId,
          accountUserId: null,
          message: text,
          history: next,
          memory: nextMemory,
        }),
        signal: controller.signal,
      });

      const rawText = await res.text();

      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }

      if (data.memory) {
        saveMemoryUpdate(data.memory);
      }

      if (res.status === 429) {
        const msg = String(
          data?.reply ||
            "You're sending messages too fast. Please wait a moment and try again."
        );

        const delay = 600 + Math.random() * 300;
        await new Promise((r) => setTimeout(r, delay));

        clearTimeout(typingTimer);
        setShowTyping(false);

        if (msg.toLowerCase().includes("free limit")) {
          setIsLimitReached(true);
        }

        setMessages((prev) =>
          [
            ...prev,
            {
              role: "assistant" as const,
              content: msg,
              timestamp: Date.now(),
            },
          ].slice(-MAX_MESSAGES)
        );
        return;
      }

      const replyText =
        typeof data?.reply === "string" && data.reply.trim()
          ? data.reply
          : "Something went wrong on my end. Please try again.";

      const delay =
        600 + Math.min(replyText.length * 12, 1400) + Math.random() * 300;

      await new Promise((r) => setTimeout(r, delay));

      clearTimeout(typingTimer);
      setShowTyping(false);

      setMessages((prev) =>
        [
          ...prev,
          {
            role: "assistant" as const,
            content: replyText,
            timestamp: Date.now(),
          },
        ].slice(-MAX_MESSAGES)
      );
    } catch (error) {
      const friendlyMessage =
        error instanceof DOMException && error.name === "AbortError"
          ? "The request took too long. Please try again."
          : "Something went wrong on my end. Please try again.";

      clearTimeout(typingTimer);
      setShowTyping(false);

      setMessages((prev) =>
        [
          ...prev,
          {
            role: "assistant" as const,
            content: friendlyMessage,
            timestamp: Date.now(),
          },
        ].slice(-MAX_MESSAGES)
      );
    } finally {
      clearTimeout(timeoutId);
      clearTimeout(typingTimer);
      setShowTyping(false);
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <main
      className="mx-auto max-w-2xl flex flex-col min-h-[100dvh] p-4 overflow-x-hidden"
      style={{
        paddingTop: `calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 1rem)`,
        paddingBottom: `calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)`,
      }}
    >
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-xl bg-white p-6 text-sm shadow-lg">
            <h2 className="mb-2 text-lg font-semibold">Talkio Pro</h2>

            <p className="mb-4 text-stone-700">
              Unlimited chats will be available with Talkio Pro.
              For now, free messages reset tomorrow.
            </p>

            <button
              type="button"
              className="w-full rounded-lg bg-green-500 px-4 py-2 text-white hover:bg-green-600"
              onClick={() => setShowUpgradeModal(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {showSafety && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-xl bg-white p-6 text-sm leading-relaxed shadow-lg">
            <h2 className="mb-3 text-lg font-semibold">Safety & Disclaimer</h2>

            <p className="mb-2">
              Talkio is an AI conversation tool designed for casual conversation
              and emotional support. It is not a therapist, doctor, or emergency
              service.
            </p>

            <p className="mb-2">
              If you are in distress or feel unsafe, please seek help from local
              emergency services or a qualified professional.
            </p>

            <p className="mb-4">
              By continuing, you understand and agree to use Talkio at your own
              discretion.
            </p>

            <button
              type="button"
              className="w-full rounded-lg bg-green-500 px-4 py-2 text-white hover:bg-green-600"
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

      {showNamePrompt && !showSafety && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-xl bg-white p-6 text-sm shadow-lg">
            <h2 className="mb-2 text-lg font-semibold">Quick thing</h2>
            <p className="mb-3 text-stone-700">
              What nickname should I call you?
            </p>

            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter a nickname"
              className="mb-3 w-full rounded-lg border px-3 py-2 focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
            />

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg border border-green-500 px-3 py-2 text-green-600 hover:bg-green-50"
                onClick={() => setShowNamePrompt(false)}
              >
                Skip
              </button>

              <button
                type="button"
                className="flex-1 rounded-lg bg-green-500 px-3 py-2 text-white hover:bg-green-600"
                onClick={handleSaveNickname}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-3">
        <h1 className="text-xl font-semibold">Talkio</h1>

        <div className="flex items-center gap-2">
          {!displayName && (
            <button
              type="button"
              className="rounded-md border px-3 py-1 text-sm"
              onClick={() => setShowNamePrompt(true)}
            >
              Nickname
            </button>
          )}

          <button
            type="button"
            onClick={clearChat}
            disabled={loading || messages.length <= 1}
            className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
          >
            Clear chat
          </button>
        </div>
      </div>

      {conversationTitle !== "New conversation" && (
        <div className="text-xs text-stone-500 px-1 mb-2">
          {conversationTitle}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden text-base">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];

          const sameAsPrev = prev?.role === m.role;
          const sameAsNext = next?.role === m.role;
          const showTimestamp = !next || next.role !== m.role;

          let bubbleClass =
            m.role === "user"
              ? "self-end bg-green-500 text-white px-4 py-2 max-w-[80%]"
              : "self-start bg-gray-200 text-black px-4 py-2 max-w-[80%]";

          if (m.role === "user") {
            bubbleClass += " rounded-2xl";
            if (sameAsPrev) bubbleClass += " rounded-tr-md";
            if (sameAsNext) bubbleClass += " rounded-br-md";
          } else {
            bubbleClass += " rounded-2xl";
            if (sameAsPrev) bubbleClass += " rounded-tl-md";
            if (sameAsNext) bubbleClass += " rounded-bl-md";
          }

          return (
            <div key={i} className="flex flex-col mb-1">
              <div className={bubbleClass}>{m.content}</div>

              {showTimestamp && (
                <div
                  className={
                    m.role === "user"
                      ? "self-end text-xs text-gray-400 mt-1"
                      : "self-start text-xs text-gray-400 mt-1"
                  }
                >
                  {new Date(m.timestamp ?? Date.now()).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
          );
        })}

        {showTyping && (
          <div className="mr-auto bg-stone-100 border border-stone-200 max-w-[80%] rounded-2xl px-4 py-3">
            <div className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-stone-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="h-2 w-2 rounded-full bg-stone-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="h-2 w-2 rounded-full bg-stone-400 animate-bounce" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && !loading && !crisisLock && (
        <div className="flex flex-wrap gap-2 pt-2">
          {["I'm stressed", "I can't sleep", "Just bored", "Something happened today"].map(
            (prompt) => (
              <button
                key={prompt}
                type="button"
                className="rounded-full border px-3 py-1 text-sm hover:bg-stone-100"
                onClick={() => sendMessage(prompt)}
              >
                {prompt}
              </button>
            )
          )}
        </div>
      )}

      {isLimitReached && !crisisLock && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
          <div className="text-stone-700">
            You’ve reached today’s free limit.
            <br />
            Keep chatting now with Talkio Pro.
          </div>

          <button
            type="button"
            onClick={() => setShowUpgradeModal(true)}
            className="rounded-lg bg-green-500 hover:bg-green-600 px-3 py-2 text-white"
          >
            Keep chatting now
          </button>
        </div>
      )}

      {!isLimitReached && (
        <div className="space-y-2 mt-3">
          {showEmojiPicker && (
            <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-3 shadow-sm">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="rounded-md px-2 py-1 text-xl hover:bg-stone-100"
                  onClick={() => addEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
              setShowEmojiPicker(false);
            }}
          >
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                placeholder={
                  crisisLock ? "Chat locked for safety." : "Type your message..."
                }
                disabled={loading || crisisLock || isLimitReached}
                rows={1}
                className="w-full resize-none rounded-full border px-4 py-2 pr-16 leading-5 outline-none"
                style={{ maxHeight: 120, overflowY: "auto" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).form?.requestSubmit();
                  }
                }}
              />

              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-lg opacity-70 hover:bg-stone-100 hover:opacity-100"
                disabled={loading || crisisLock || isLimitReached}
              >
                😊
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || crisisLock || isLimitReached || !input.trim()}
              className="rounded-full bg-emerald-500 px-5 py-2 text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {loading ? "..." : "Send"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}