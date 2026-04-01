"use client";

import React, { useEffect, useRef, useState } from "react";

import { signInAnonymously } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

const MAX_MESSAGES = 30;

type BootstrapProfile = {
  nickname?: string;
  recentMoodTrend?: string;
  commonEmotionalStates?: string[];
  supportStyle?: string[];
  styleProfile?: Record<string, any>;
  lastOpenLoop?: string;
};

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

function loadMemory(userId: string): TalkioMemory {
  if (typeof window === "undefined") return {};
  try {
    return (
      JSON.parse(localStorage.getItem(`talkio_memory_${userId}`) || "{}") || {}
    );
  } catch {
    return {};
  }
}

function persistMemory(userId: string, mem: TalkioMemory) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`talkio_memory_${userId}`, JSON.stringify(mem));
  } catch {}
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

function getHumanReplyDelay(mood: string, replyText: string) {
  if (replyText.length < 40) {
    return 650 + Math.random() * 250;
  }

  const baseByMood: Record<string, number> = {
    sad: 1650,
    anxious: 1500,
    stressed: 1450,
    angry: 1300,
    tired: 1250,
    okay: 850,
    happy: 700,
  };

  const base = baseByMood[mood] ?? 950;
  const lengthFactor = Math.min(replyText.length * 6, 900);
  const randomness = Math.random() * 250;

  return base + lengthFactor + randomness;
}

function getTypingBehavior(mood: string) {
  switch (mood) {
    case "sad":
    case "anxious":
    case "stressed":
      return {
        typingAppearDelay: 550,
        minTypingVisible: 700,
        hesitationDelay: 250,
      };

    case "happy":
    case "okay":
      return {
        typingAppearDelay: 420,
        minTypingVisible: 420,
        hesitationDelay: 80,
      };

    case "angry":
      return {
        typingAppearDelay: 380,
        minTypingVisible: 420,
        hesitationDelay: 100,
      };

    default:
      return {
        typingAppearDelay: 450,
        minTypingVisible: 520,
        hesitationDelay: 140,
      };
  }
}

function getTypingDotClass(mood: string) {
  switch (mood) {
    case "sad":
    case "anxious":
    case "stressed":
      return "animate-bounce [animation-duration:1.2s]";
    case "happy":
    case "okay":
      return "animate-bounce [animation-duration:0.6s]";
    case "angry":
      return "animate-bounce [animation-duration:0.75s]";
    default:
      return "animate-bounce [animation-duration:0.9s]";
  }
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
  const [showTyping, setShowTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([buildGreeting("")]);

  const greeting = buildGreeting(displayName);

  const [typingMood, setTypingMood] = useState("default");

  const [userId, setUserId] = useState("guest");

  const [serverProfile, setServerProfile] = useState<BootstrapProfile>({});
  const [serverSummary, setServerSummary] = useState("");
  
  function saveMemoryUpdate(data: Partial<TalkioMemory>) {
  setMemory((prev) => {
    const next = { ...prev, ...data };

    if (userId !== "guest") {
      persistMemory(userId, next);
    }

    return next;
  });
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

  async function ensureUser() {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }

    const user = auth.currentUser;
const uid = user?.uid || "guest";

setUserId(uid);
setMemory(loadMemory(uid));

if (!user) return;

const token = await user.getIdToken();

const res = await fetch("/api/bootstrap", {
  method: "GET",
  headers: {
    Authorization: `Bearer ${token}`,
  },
  credentials: "include",
});

    const data = await res.json().catch(() => ({}));

    if (!res.ok) return;

    if (data?.profile && typeof data.profile === "object") {
      setServerProfile(data.profile);

      if (!displayName && typeof data.profile.nickname === "string" && data.profile.nickname.trim()) {
        setDisplayName(data.profile.nickname.trim());
      }
    }

    if (typeof data?.conversationSummary === "string") {
      setServerSummary(data.conversationSummary);
    }
  }

  ensureUser().catch(() => {
    setUserId("guest");
  });
}, []);

  useEffect(() => {
  if (typeof window === "undefined") return;

  const savedNick = localStorage.getItem(`talkio_nickname_${userId}`) || "";

  if (savedNick.trim() && !displayName.trim()) {
    setDisplayName(savedNick.trim());
  }
}, [userId, displayName]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const localSid = userId;
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
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const localSid = userId;
    const savedTitle = localStorage.getItem(`talkio_title_${localSid}`);

    if (savedTitle) {
      setConversationTitle(savedTitle);
    }
  }, [userId]);

  useEffect(() => {
  if (typeof window === "undefined") return;

  const localSid = userId;
  localStorage.setItem(`talkio_title_${localSid}`, conversationTitle);
}, [conversationTitle, userId]);

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

  const localSid = userId;
  localStorage.setItem(`talkio_messages_${localSid}`, JSON.stringify(messages));
}, [messages, userId]);

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
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }

  const user = auth.currentUser;

  if (!user) {
    throw new Error("Auth failed to initialize");
  }

  const token = await user.getIdToken();

  const text = (overrideText ?? input).trim();
  if (!text || loading || crisisLock || isLimitReached) return;

    setLoading(true);
setShowTyping(false);

const mood = inferMood(text);
setTypingMood(mood || "default");

const typingBehavior = getTypingBehavior(mood || "default");

const thinkingDelay =
  320 + Math.random() * 220 + typingBehavior.hesitationDelay;

let typingShown = false;

const typingTimer = setTimeout(() => {
  typingShown = true;
  setShowTyping(true);
}, typingBehavior.typingAppearDelay);

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

    const nextMemory: TalkioMemory = mood
      ? { ...memory, mood, updatedAt: Date.now() }
      : memory;

    if (mood) {
      setMemory(nextMemory);
      if (userId !== "guest") {
  persistMemory(userId, nextMemory);
}
    }
    
    try {
      
      await new Promise((r) => setTimeout(r, thinkingDelay));
      const now = new Date();

const res = await fetch("/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  credentials: "include",
  body: JSON.stringify({
    message: text,
    history: next,
    memory: nextMemory,
    selectedMode: "stoic",

    localTime: now.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }),
    localDate: now.toLocaleDateString(),
    localWeekday: now.toLocaleDateString(undefined, {
      weekday: "long",
    }),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    localHour: now.getHours(),
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

        const delay = getHumanReplyDelay(mood, msg);
        await new Promise((r) => setTimeout(r, delay));

        clearTimeout(typingTimer);

        if (!typingShown) {
          await new Promise((r) =>
            setTimeout(r, typingBehavior.minTypingVisible)
          );
        }

        setShowTyping(false);
        setTypingMood("default");
        setIsLimitReached(true);

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

      const delay = getHumanReplyDelay(mood, replyText);
      await new Promise((r) => setTimeout(r, delay));

      clearTimeout(typingTimer);

      if (!typingShown) {
        await new Promise((r) =>
          setTimeout(r, typingBehavior.minTypingVisible)
        );
      }

      setShowTyping(false);
      setTypingMood("default");

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
      setTypingMood("default");

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
      setTypingMood("default");
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function saveProfileToBackend(profile: { nickname?: string; timezone?: string }) {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error("Auth failed to initialize");
  }

  const token = await user.getIdToken();

  const res = await fetch("/api/profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify(profile),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.reply || "Failed to save profile");
  }

  return data;
}

async function saveNickname(name: string) {
  const clean = name.trim().slice(0, 40);

  setDisplayName(clean);

  if (typeof window !== "undefined") {
    localStorage.setItem(`talkio_nickname_${userId}`, clean);
  }

  try {
    await saveProfileToBackend({
      nickname: clean,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch (error) {
    console.error("Failed to save nickname to backend:", error);
  }
}
async function handleSaveNickname() {
  await saveNickname(displayName);
  setShowNamePrompt(false);
}

 return (
  <main
    className="mx-auto flex h-dvh max-w-2xl flex-col overflow-hidden bg-white text-stone-900"
    style={{
      paddingTop: `calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 0.75rem)`,
      paddingBottom: `calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 0.5rem)`,
    }}
  >
    {showUpgradeModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="max-w-md rounded-2xl bg-white p-6 text-sm shadow-lg">
          <h2 className="mb-2 text-lg font-semibold">Talkio Pro</h2>

          <p className="mb-4 text-stone-700">
            Unlimited chats will be available with Talkio Pro.
            For now, free messages reset tomorrow.
          </p>

          <button
            type="button"
            className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-white hover:bg-emerald-600"
            onClick={() => setShowUpgradeModal(false)}
          >
            Got it
          </button>
        </div>
      </div>
    )}

    {showSafety && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="max-w-md rounded-2xl bg-white p-6 text-sm leading-relaxed shadow-lg">
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
            className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-white hover:bg-emerald-600"
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
        <div className="max-w-md rounded-2xl bg-white p-6 text-sm shadow-lg">
          <h2 className="mb-2 text-lg font-semibold">Quick thing</h2>
          <p className="mb-3 text-stone-700">
            What nickname should I call you?
          </p>

          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter a nickname"
            className="mb-3 w-full rounded-xl border px-3 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />

          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl border border-emerald-500 px-3 py-2.5 text-emerald-600 hover:bg-emerald-50"
              onClick={() => setShowNamePrompt(false)}
            >
              Skip
            </button>

            <button
  type="button"
  className="flex-1 rounded-xl bg-emerald-500 px-3 py-2.5 text-white hover:bg-emerald-600"
  onClick={async () => {
    await handleSaveNickname();
  }}
>
  Save
</button>
          </div>
        </div>
      </div>
    )}

    <div className="flex items-center justify-between gap-2 px-4 pb-3">
      <h1 className="text-2xl font-semibold tracking-tight">Talkio</h1>

      <div className="flex items-center gap-2">
        {!displayName && (
          <button
            type="button"
            className="rounded-xl border px-3 py-2 text-sm"
            onClick={() => setShowNamePrompt(true)}
          >
            Nickname
          </button>
        )}

        <button
          type="button"
          onClick={clearChat}
          disabled={loading || messages.length <= 1}
          className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
        >
          Clear chat
        </button>
      </div>
    </div>

    {conversationTitle !== "New conversation" && (
      <div className="px-4 pb-2 text-xs text-stone-500">
        {conversationTitle}
      </div>
    )}

    <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];

          const sameAsPrev = prev?.role === m.role;
          const sameAsNext = next?.role === m.role;
          const showTimestamp = !next || next.role !== m.role;

          let bubbleClass =
            m.role === "user"
              ? "self-end max-w-[82%] bg-emerald-500 px-4 py-3 text-white shadow-sm"
              : "self-start max-w-[82%] bg-stone-100 px-4 py-3 text-stone-900 shadow-sm";

          if (m.role === "user") {
            bubbleClass += " rounded-[22px] rounded-br-xl";
            if (sameAsPrev) bubbleClass += " rounded-tr-md";
            if (sameAsNext) bubbleClass += " rounded-br-md";
          } else {
            bubbleClass += " rounded-[22px] rounded-bl-xl";
            if (sameAsPrev) bubbleClass += " rounded-tl-md";
            if (sameAsNext) bubbleClass += " rounded-bl-md";
          }

          return (
            <div key={i} className="flex flex-col">
              <div className={bubbleClass}>
                <div className="whitespace-pre-wrap break-words text-[16px] leading-7">
                  {m.content}
                </div>
              </div>

              {showTimestamp && (
                <div
                  className={
                    m.role === "user"
                      ? "mt-1 self-end px-2 text-[12px] text-stone-400"
                      : "mt-1 self-start px-2 text-[12px] text-stone-400"
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
  <div className="mr-auto max-w-[82%] rounded-[22px] rounded-bl-xl border border-stone-200 bg-stone-100 px-4 py-3 shadow-sm">
    <div className="flex gap-1">
      <span
        className={`h-2 w-2 rounded-full bg-stone-400 ${getTypingDotClass(
          typingMood
        )} [animation-delay:-0.3s]`}
      />
      <span
        className={`h-2 w-2 rounded-full bg-stone-400 ${getTypingDotClass(
          typingMood
        )} [animation-delay:-0.15s]`}
      />
      <span
        className={`h-2 w-2 rounded-full bg-stone-400 ${getTypingDotClass(
          typingMood
        )}`}
      />
    </div>
  </div>
)}

        {messages.length === 1 && !loading && !crisisLock && (
          <div className="flex flex-wrap gap-2 pt-1">
            {["I'm stressed", "I can't sleep", "Just bored", "Something happened today"].map(
              (prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="rounded-full border px-3 py-1.5 text-sm hover:bg-stone-100"
                  onClick={() => sendMessage(prompt)}
                >
                  {prompt}
                </button>
              )
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>

    {isLimitReached && !crisisLock && (
      <div className="mx-3 mb-3 flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-sm">
        <div className="text-stone-700">
          You’ve reached today’s free limit.
          <br />
          Keep chatting now with Talkio Pro.
        </div>

        <button
          type="button"
          onClick={() => setShowUpgradeModal(true)}
          className="rounded-xl bg-emerald-500 px-3 py-2 text-white hover:bg-emerald-600"
        >
          Keep chatting now
        </button>
      </div>
    )}

    {!isLimitReached && (
      <div className="border-t bg-white px-3 pt-2">
        {showEmojiPicker && (
          <div className="mb-2 flex flex-wrap gap-2 rounded-2xl border bg-white p-3 shadow-sm">
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
          className="flex items-end gap-2 pb-2"
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
              className="min-h-[50px] max-h-[120px] w-full resize-none rounded-[28px] border border-stone-300 px-4 py-3 pr-14 text-[16px] leading-6 outline-none placeholder:text-stone-400 focus:border-stone-400"
              style={{ overflowY: "auto" }}
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
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-lg opacity-70 hover:bg-stone-100 hover:opacity-100"
              disabled={loading || crisisLock || isLimitReached}
            >
              😊
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || crisisLock || isLimitReached || !input.trim()}
            className="h-[50px] rounded-full bg-emerald-400 px-5 text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    )}
  </main>
);
}