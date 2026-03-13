"use client";

import React, { useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant";
type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: number;
  };

// Keep this as “last N messages kept in UI history”
const MAX_MESSAGES = 30;

function bubbleClass(role: "user" | "assistant") {
  return [
    "relative max-w-[80%] rounded-2xl px-4 py-3 leading-relaxed shadow-sm whitespace-pre-wrap break-words",
    role === "user"
      ? "ml-auto bg-emerald-400 text-white rounded-br-md"
      : "mr-auto bg-stone-100 border border-stone-200 text-stone-900 rounded-bl-md",
  ].join(" ");
}

function detectIntentAndMood(text: string) {
  const t = (text || "").toLowerCase();

  const wantsAdvice =
    t.includes("what should i do") ||
    t.includes("any advice") ||
    t.includes("help me") ||
    t.includes("how do i") ||
    t.includes("what can i do");

  const wantsVenting =
    t.includes("i just want to vent") ||
    t.includes("just listening") ||
    t.includes("i'm so tired") ||
    t.includes("i feel") ||
    t.includes("i hate");

  const wantsDistraction =
    t.includes("distract me") ||
    t.includes("make me laugh") ||
    t.includes("tell me a joke") ||
    t.includes("i'm bored");

  let intent: "vent" | "advice" | "distraction" | "chat" = "chat";
  if (wantsAdvice) intent = "advice";
  else if (wantsDistraction) intent = "distraction";
  else if (wantsVenting) intent = "vent";

  // super simple mood guess (only if obvious)
  let mood = "";
  if (t.includes("anxious") || t.includes("panic")) mood = "anxious";
  else if (t.includes("sad") || t.includes("cry")) mood = "sad";
  else if (t.includes("angry") || t.includes("mad")) mood = "angry";
  else if (t.includes("stressed") || t.includes("overwhelmed")) mood = "stressed";

  return { intent, mood };
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

function bubbleTail(role: "user" | "assistant") {
  return role === "user"
    ? "after:content-[''] after:absolute after:-right-2 after:bottom-2 after:w-3 after:h-3 after:bg-emerald-400 after:rounded-sm after:rotate-45"
    : "after:content-[''] after:absolute after:-left-2 after:bottom-2 after:w-3 after:h-3 after:bg-stone-100 after:rounded-sm after:rotate-45";
}
/**
 * Local-only session id for saving chat history in localStorage.
 * (NOT used for backend quota anymore — backend uses HttpOnly cookie talkio_sid.)
 */
function getOrCreateLocalSessionId() {
  const KEY = "talkio_local_session_id_v1";

  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id =
        (globalThis.crypto?.randomUUID?.() ??
          `sid_${Date.now()}_${Math.random()}`) + "";
      localStorage.setItem(KEY, id);
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

// 2-line “more human” greeting
function buildGreeting(displayName: string): ChatMessage {
  const name = (displayName || "").trim();

  return {
    role: "assistant",
    content: name
      ? `Hey ${name}, I'm Talkio.\n\nYou can talk to me about anything — something good, something stressful, or even if you're just bored.`
      : `Hey, I'm Talkio.\n\nYou can talk to me about anything — something good, something stressful, or even if you're just bored.`,
  };
}

type TalkioMemory = {
  mood?: string;          // e.g. "stressed", "sad", "anxious", "okay"
  updatedAt?: number;     // epoch ms
};

const MEMORY_KEY = "talkio_memory_v1";

function loadMemory(): TalkioMemory {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveMemory(mem: TalkioMemory) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
  } catch {}
}

// Simple heuristic (cheap + fast). Improve later.
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

  const [displayName, setDisplayName] = useState<string>("");
  const [showNamePrompt, setShowNamePrompt] = useState(false);

  const [input, setInput] = useState("");
  const [showSafety, setShowSafety] = useState(false);
  const [conversationTitle, setConversationTitle] = useState<string>("New conversation");

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [anonymousId, setAnonymousId] = useState("");



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
 
  // Load nickname once
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
  if (typeof window === "undefined") return;

  const saved = localStorage.getItem("talkio_memory");
  if (saved) {
    try {
      setMemory(JSON.parse(saved));
    } catch {}
  }
}, []);

function saveMemory(data: any) {
  const next = { ...memory, ...data };
  setMemory(next);

  if (typeof window !== "undefined") {
    localStorage.setItem("talkio_memory", JSON.stringify(next));
  }
}

  const greeting = buildGreeting(displayName);

  const [messages, setMessages] = useState<ChatMessage[]>([buildGreeting("")]);

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

    setMessages(safe.length ? safe : [buildGreeting(displayName)]);
  } catch {
    setMessages([buildGreeting(displayName)]);
  }
}, []);

const [showEmojiPicker, setShowEmojiPicker] = useState(false);

const EMOJIS = ["🙂", "😊", "😄", "😅", "😂", "🥲", "😍", "😢", "😡", "👍", "❤️", "✨"];

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
  setAnonymousId(getOrCreateAnonymousId());
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
  const savedTitle = localStorage.getItem(`talkio_title_${localSid}`);

  if (savedTitle) {
    setConversationTitle(savedTitle);
  }
}, []);


  // If the first message is the greeting, refresh it when displayName changes
  useEffect(() => {
    setMessages((prev) => {
      if (!prev.length) return [greeting];
      const first = prev[0];
      const isOurGreeting =
  first.role === "assistant" &&
  (first.content.startsWith("Hey") || first.content.includes("I’m here if you want to talk about what’s going on."));
      if (!isOurGreeting) return prev;
      return [greeting, ...prev.slice(1)];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName]);

  useEffect(() => {
  setMemory(loadMemory());
}, []);

  // Save messages locally (per local session)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const localSid = getOrCreateLocalSessionId();
    localStorage.setItem(`talkio_messages_${localSid}`, JSON.stringify(messages));
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

  if (!overrideText) {
    setInput("");
  }

  const next: ChatMessage[] = [
    ...messages,
    { role: "user" as const, content: text },
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
    saveMemory(nextMemory);
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

     if (res.status === 429) {
      const msg = String(
        data?.reply ||
          "You're sending messages too fast. Please wait a moment and try again."
      );

      const delay = 600 + Math.random() * 300;
      await new Promise((r) => setTimeout(r, delay));

      setMessages((prev) => [
  ...prev,
  {
    role: "assistant",
    content: replyText,
    timestamp: Date.now(),
  },
]);

      const err = String(data?.error || "");
      if (
        err === "Daily message limit reached" ||
        err === "Daily capacity reached" ||
        err === "Gemini quota reached"
      ) {
        setIsLimitReached(true);
      }

      return;
    }

    if (!res.ok) {
      const friendly =
        typeof data?.reply === "string" && data.reply.trim()
          ? data.reply
          : "Something went wrong on my end. Please try again.";

      setMessages((prev) =>
        [...prev, { role: "assistant" as const, content: friendly }].slice(
          -MAX_MESSAGES
        )
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

    setMessages((prev) =>
      [...prev, { role: "assistant" as const, content: replyText }].slice(
        -MAX_MESSAGES
      )
    );

    if (data?.flagged === "crisis") {
      setCrisisLock(true);
    }
  } catch (err: any) {
    console.error("sendMessage error:", err);

    const msg = String(err?.message ?? "");
    const isAbort =
      err?.name === "AbortError" || msg.toLowerCase().includes("abort");

    const friendlyMessage = isAbort
      ? "Connection is slow right now. Please try sending again."
      : "Something went wrong on my end. Please try again.";

    setMessages((prev) =>
      [...prev, { role: "assistant" as const, content: friendlyMessage }].slice(
        -MAX_MESSAGES
      )
    );
  } finally {
    clearTimeout(timeoutId);
    setLoading(false);
    inputRef.current?.focus();
  }
}

  return (
  <main
    className="mx-auto max-w-2xl flex flex-col min-h-[100dvh] p-4 overflow-x-hidden ..."
    style={{
      paddingTop: `calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 1rem)`,
      paddingBottom: `calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)`
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
      {/* Safety disclaimer overlay */}
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

      {/* Nickname prompt overlay */}
      {showNamePrompt && !showSafety && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-xl bg-white p-6 text-sm shadow-lg">
            <h2 className="mb-2 text-lg font-semibold">Quick thing</h2>
            <p className="mb-3 text-stone-700">What nickname should I call you?</p>

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

      {/* Main chat UI */}
      <div className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden text-base">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
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
  <div className="text-xs text-stone-500 px-1">
    {conversationTitle}
  </div>
)}

        {/* Message list grows to fill available space */}
        <div className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden text-base">
  {messages.map((m, i) => (
  <div key={i} className="flex flex-col mb-3">

    <div
      className={
        m.role === "user"
          ? "self-end bg-green-500 text-white rounded-xl px-4 py-2 max-w-[80%]"
          : "self-start bg-gray-200 text-black rounded-xl px-4 py-2 max-w-[80%]"
      }
    >
      {m.content}
    </div>

    <div
      className={
        m.role === "user"
          ? "self-end text-xs text-gray-400 mt-1"
          : "self-start text-xs text-gray-400 mt-1"
      }
    >
      {new Date(m.timestamp).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}
    </div>

  </div>
))}

  {loading && (
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
    {[
      "I'm stressed",
      "I can't sleep",
      "Just bored",
      "Something happened today",
    ].map((prompt) => (
      <button
        key={prompt}
        type="button"
        className="rounded-full border px-3 py-1 text-sm hover:bg-stone-100"
        onClick={() => sendMessage(prompt)}
      >
        {prompt}
      </button>
    ))}
  </div>
)}
        {/* Upgrade banner when limit reached */}
        {isLimitReached && !crisisLock && (
          <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
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
        
 {/* Input form pinned to bottom */}
{!isLimitReached && (
  <div className="space-y-2">
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
            crisisLock
              ? "Chat locked for safety."
              : "Type your message..."
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
    </div>
  </main>
);
}