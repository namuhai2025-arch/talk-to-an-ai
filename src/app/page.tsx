"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getFirebaseAuth,
  getFirebaseAnalytics,
  logEvent,
} from "@/lib/firebase";
import { registerTalkioPushToken } from "@/lib/registerPushToken";
import { Share } from "@capacitor/share";
import { Keyboard } from "@capacitor/keyboard";
import { configureRevenueCat } from "@/lib/revenuecat";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: number;
  isFeedbackPrompt?: boolean;
};

const MAX_MESSAGES = 30;

type SafetyInterruption = {
  blocked: boolean;
  reason?: "violent_admission" | "violent_threat" | "coverup_request";
};

function normalizeSafetyText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/@/g, "a")
    .replace(/3/g, "e")
    .replace(/[^a-z\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifySafetyInterruption(input: string): SafetyInterruption {
  const text = normalizeSafetyText(input);

  const emotionalHurtOnly =
  /\b(hurt me|hurt my feelings|i feel hurt|felt hurt|they hurt me|he hurt me|she hurt me|acted like i hurt them|acted like i hurt him|acted like i hurt her)\b/i.test(text) &&
  !/\b(kill|murder|shoot|stab|poison|strangle|weapon|gun|knife|blood|body|corpse)\b/i.test(text);

if (emotionalHurtOnly) {
  return { blocked: false };
}

const emotionalManipulationOnly =
  /\b(gaslight|gaslighting|manipulate|manipulated|narcissist|narcissistic|emotionally abusive|toxic relationship|they blamed me|made me feel crazy|made me doubt myself)\b/i.test(text);

if (emotionalManipulationOnly) {
  return { blocked: false };
}

  const violentAdmission =
  /\b(i|we)\b.{0,40}\b(killed|kill|k1lled|murdered|murderd|murdr|shot|shoot|stabbed|stab|stabb|poisoned|poison|strangled|strangle|choked|choke|beat)\b.{0,20}\b(someone|somebody|person|him|her|them|wife|husband|girlfriend|boyfriend|boss|coworker|friend|child)\b/i.test(text) ||

  /\b(i|we)\b.{0,20}\b(committed murder|killed a person|murdered a person)\b/i.test(text) ||

  /\b(yes|yeah|yep|actually|honestly|seriously)\b.{0,20}\b(i|we)\b.{0,20}\b(killed|murdered|shot|stabbed)\b/i.test(text);

  const violentThreat =
  /\b(i|im|i'm|we)\b.{0,20}\b(will|wil|gonna|going to|am going to|are going to|want to|wanna|plan to|planning to|about to)?\b.{0,20}\b(kill|kil|k1ll|murder|murdr|shoot|shot|stab|stabb|poison|poizon|strangle)\b.{0,20}\b(him|her|them|someone|somebody|person|people|wife|husband|boyfriend|girlfriend|boss|friend)?\b/i.test(text);

  const coverupRequest =
    /\b(hide|bury|dispose of|get rid of|cover up|clean up)\b.*\b(body|corpse|evidence|weapon|blood)\b/.test(text) ||
    /\bhow\s+(do|can)\s+i\s+(hide|bury|dispose of|get rid of|cover up)\b/.test(text);

  if (violentAdmission) return { blocked: true, reason: "violent_admission" };
  if (violentThreat) return { blocked: true, reason: "violent_threat" };
  if (coverupRequest) return { blocked: true, reason: "coverup_request" };

  return { blocked: false };
}

function buildGreeting(displayName: string): ChatMessage {
  const name = displayName.trim();

  return {
    role: "assistant",
    content: name ? `Hey ${name}, I'm Talkio.` : "Hey, I'm Talkio.",
    timestamp: Date.now(),
  };
}

function buildConversationTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(
    (m) => m.role === "user" && m.content.trim().length > 0
  );

  if (!firstUser) return "New conversation";

  const text = firstUser.content.trim().replace(/\s+/g, " ");
  return text.length <= 36 ? text : `${text.slice(0, 36).trim()}...`;
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function Page() {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [acceptedTerms, setAcceptedTerms] = useState(false);  

  const [mounted, setMounted] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const isSignedOut = userId === "signed_out";

  const [pinRequired, setPinRequired] = useState(false);
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [enteredPin, setEnteredPin] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [draftNickname, setDraftNickname] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([buildGreeting("")]);
  const [conversationTitle, setConversationTitle] =
    useState("New conversation");

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showTyping, setShowTyping] = useState(false);

  const [showSafety, setShowSafety] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isLimitReached, setIsLimitReached] = useState(false);

  const [crisisLock, setCrisisLock] = useState(false);

  const [feedbackAsked, setFeedbackAsked] = useState(false);
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);

  const storageKeys = useMemo(
    () => ({
      messages: "talkio_messages",
      title: "talkio_title",
      nickname: "talkio_nickname",
      safety: "talkio_safety_acknowledged",
    }),
    []
  );

  useEffect(() => {
  const done = localStorage.getItem("talkio_onboarding_complete");

  if (!done) {
    window.location.href = "/onboarding";
  }
}, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
  if (!mounted) return;

  const enabled =
    localStorage.getItem("talkio_pin_enabled") === "true";

  if (enabled) {
    setPinRequired(true);
  }
}, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    const acknowledged = localStorage.getItem(storageKeys.safety);
    if (!acknowledged) setShowSafety(true);
  }, [mounted, storageKeys]);

  useEffect(() => {
    if (!mounted) return;

    const savedNickname = loadJson<string>(storageKeys.nickname, "");
    const cleanNickname =
      typeof savedNickname === "string" ? savedNickname.trim() : "";

    if (cleanNickname) {
      setDisplayName(cleanNickname);
      setDraftNickname(cleanNickname);
    }

    const savedMessages = loadJson<ChatMessage[]>(storageKeys.messages, []);
    const normalizedMessages = Array.isArray(savedMessages)
      ? savedMessages
          .filter(
            (m) =>
              m &&
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string"
          )
          .map((m, i) => ({
            role: m.role,
            content: m.content,
            timestamp:
              typeof m.timestamp === "number" ? m.timestamp : Date.now() + i,
          }))
          .slice(-MAX_MESSAGES)
      : [];

    if (normalizedMessages.length > 0) {
  setMessages(normalizedMessages);
} else {
  setMessages([buildGreeting(cleanNickname)]);
}

    const savedTitle = loadJson<string>(storageKeys.title, "New conversation");
    if (typeof savedTitle === "string" && savedTitle.trim()) {
      setConversationTitle(savedTitle);
    }
  }, [mounted, storageKeys]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(storageKeys.nickname, JSON.stringify(displayName));
  }, [displayName, mounted, storageKeys]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(storageKeys.messages, JSON.stringify(messages));
  }, [messages, mounted, storageKeys]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(storageKeys.title, JSON.stringify(conversationTitle));
  }, [conversationTitle, mounted, storageKeys]);

  useEffect(() => {
    if (!mounted) return;

    setMessages((prev) => {
      if (!prev.length) return [buildGreeting(displayName)];

      const first = prev[0];
      const shouldReplaceGreeting =
        first.role === "assistant" &&
        (first.content.startsWith("Hey") ||
          first.content.includes("I'm Talkio."));

      if (!shouldReplaceGreeting) return prev;

      return [buildGreeting(displayName), ...prev.slice(1)];
    });
  }, [displayName, mounted]);

  useEffect(() => {
  if (!mounted) return;

  const params = new URLSearchParams(window.location.search);
  const source = params.get("source");
  const message = params.get("message");

  if (source === "checkin") {
    sessionStorage.setItem("talkio_checkin_opened", "true");

    if (message) {
      sessionStorage.setItem("talkio_checkin_message", message);
    }
  }
}, [mounted]);

  useEffect(() => {
  if (!mounted) return;

  const openedFromCheckin =
    sessionStorage.getItem("talkio_checkin_opened") === "true";

  if (!openedFromCheckin) return;

  const checkinMessage =
    sessionStorage.getItem("talkio_checkin_message") ||
    "how did today feel for you";

  sessionStorage.removeItem("talkio_checkin_opened");
  sessionStorage.removeItem("talkio_checkin_message");

  setMessages((prev) => {
    const alreadyInserted = prev.some(
      (m) =>
        m.role === "assistant" &&
        m.content === checkinMessage
    );

    if (alreadyInserted) return prev;

    return [
      ...prev,
      {
        role: "assistant" as const,
        content: checkinMessage,
        timestamp: Date.now(),
      },
    ];
  });
}, [mounted]);

  useEffect(() => {
  async function ensureUser() {
    const auth = getFirebaseAuth();

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user) {
      setUserId("signed_out");
      return;
    }

    setUserId(user.uid);

    await registerTalkioPushToken().catch(console.error);

    await configureRevenueCat(user.uid).catch(console.error);
  }

  if (!mounted) return;

  ensureUser().catch(() => {
    setUserId("signed_out");
  });
}, [mounted]);

  useEffect(() => {
  const shouldOpenNickname = localStorage.getItem("openNicknamePrompt");

  if (shouldOpenNickname === "true") {
    localStorage.removeItem("openNicknamePrompt");
    setShowNamePrompt(true);
  }
}, []);

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

  const handleResize = () => {
    window.setTimeout(scrollToBottom, 120);
  };

  window.visualViewport?.addEventListener("resize", handleResize);
  window.addEventListener("resize", handleResize);

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    window.visualViewport?.removeEventListener("resize", handleResize);
    window.removeEventListener("resize", handleResize);
  };
}, [messages, showTyping, mounted]);

   useEffect(() => {
  Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(console.error);
}, []);

  async function shareTalkio() {
  try {
    await Share.share({
      title: "Talkio",
      text: "A calm AI space to think, breathe, and talk things through.",
      url: "https://talkiochat.com/download",
      dialogTitle: "Share Talkio",
    });
  } catch (err) {
    console.error("Share failed:", err);
    alert("Sharing is not available on this device yet.");
  }
}

  function clearChat() {
  const greeting = buildGreeting(displayName);

  setMessages([greeting]);
  setConversationTitle("New conversation");
  setInput("");
  setShowTyping(false);
  setLoading(false);
  setIsLimitReached(false);
  setCrisisLock(false);

  requestAnimationFrame(() => {
    inputRef.current?.focus();
  });
}
  
  function saveNickname() {
    const clean = draftNickname.trim().slice(0, 40);
    setDisplayName(clean);
    setDraftNickname(clean);
    setShowNamePrompt(false);
  }

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    const normalizedText = text.toLowerCase();

const positiveSignals = [
  "thank you",
  "thanks",
  "helped",
  "i feel better",
  "that helped",
  "glad",
  "appreciate",
  "needed that",
  "feel calmer",
  "feel okay",
];

const isPositiveMoment = positiveSignals.some((signal) =>
  normalizedText.includes(signal)
);

    if (!text || loading || isLimitReached || showSafety || crisisLock) return;

    const safetyInterruption = classifySafetyInterruption(text);

if (safetyInterruption.blocked) {
  if (!overrideText) {
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  const nextMessages: ChatMessage[] = [
    ...messages,
    {
      role: "user" as const,
      content: text,
      timestamp: Date.now(),
    },
  ].slice(-MAX_MESSAGES);

  setMessages(nextMessages);

  if (conversationTitle === "New conversation") {
    setConversationTitle(buildConversationTitle(nextMessages));
  }

  setCrisisLock(true);
  setShowTyping(false);
  setLoading(false);

  logEvent(getFirebaseAnalytics(), "safety_interruption_triggered", {
    reason: safetyInterruption.reason || "unknown",
    source: "frontend",
  });

  return;
}

    setLoading(true);
    setShowTyping(false);

    if (!overrideText) {
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        role: "user" as const,
        content: text,
        timestamp: Date.now(),
      },
    ].slice(-MAX_MESSAGES);

    setMessages(nextMessages);

    if (conversationTitle === "New conversation") {
      setConversationTitle(buildConversationTitle(nextMessages));
    }

    const typingTimer = window.setTimeout(() => {
  setShowTyping(true);
}, 300);

const humanDelay = Math.floor(Math.random() * 700) + 300;

await new Promise((resolve) =>
  setTimeout(resolve, humanDelay)
);

    try {
      const auth = getFirebaseAuth();

      if (!auth.currentUser) {
  throw new Error("No signed-in user available.");
}

      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : "";

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
  message: text,
  messages: nextMessages,
  source:
    typeof window !== "undefined" &&
    sessionStorage.getItem("talkio_checkin_reply_context") === "true"
      ? "checkin"
      : "chat",
}),
      });

      const data = await res.json().catch(() => ({}));

      if (data?.safetyBlocked === true) {
  setCrisisLock(true);
  setShowTyping(false);
  setLoading(false);
  return;
}

      logEvent(getFirebaseAnalytics(), "chat_message_sent", {
  source: "chat",
});

      if (typeof window !== "undefined") {
      sessionStorage.removeItem("talkio_checkin_reply_context");
      }

      if (data?.crisisLock === true) {
      setCrisisLock(true);
      }

      if (data?.remainingDaily > 0) {
      setIsLimitReached(false);
      }

      if (res.status === 429 || data?.paywallRequired) {
      setIsLimitReached(true);
      }
      
      if (data?.paywallRequired) {
      window.location.href = "/paywall";
      return;
      }

      let assistantReply =
        typeof data?.reply === "string" && data.reply.trim()
          ? data.reply
          : "...";

      if (res.status === 429) {
        setIsLimitReached(true);
      }

      const replyDelay = 700 + Math.min(assistantReply.length * 5, 700);
      await new Promise((resolve) => setTimeout(resolve, replyDelay));

      setMessages((prev): ChatMessage[] => {
  const nextMessages: ChatMessage[] = [
    ...prev,
    {
      role: "assistant" as const,
      content: assistantReply,
      timestamp: Date.now(),
    },
  ];

  return nextMessages.slice(-MAX_MESSAGES);
});

logEvent(getFirebaseAnalytics(), "reply_generated", {
  mode: data?.dynamicMode || "unknown",
  path: data?.path || "unknown",
});

const reviewCompleted =
  typeof window !== "undefined" &&
  localStorage.getItem("talkio_review_prompt_completed") === "true";

if (
  !feedbackAsked &&
  !reviewCompleted &&
  messages.filter((m) => m.role === "assistant").length >= 7 &&
  isPositiveMoment
) {
  setFeedbackAsked(true);

  setTimeout(() => {
    setShowReviewPrompt(true);
  }, 1800);
}

} catch {
setMessages((prev): ChatMessage[] => {
  const nextMessages: ChatMessage[] = [
    ...prev,
    {
      role: "assistant" as const,
      content: "...",
      timestamp: Date.now(),
    },
  ];

  

  return nextMessages.slice(-MAX_MESSAGES);

  }); 
    } finally {
      clearTimeout(typingTimer);
      setShowTyping(false);
      setLoading(false);

      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }

  if (!mounted || userId === null) return null;

  if (pinRequired && !pinUnlocked) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <div className="w-full max-w-sm rounded-[32px] bg-white p-8 shadow-sm ring-1 ring-stone-100">
        <h1 className="text-3xl font-semibold text-stone-900">
          Privacy Lock
        </h1>

        <p className="mt-3 text-stone-600">
          Enter your 4-digit PIN.
        </p>

        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={enteredPin}
          onChange={(e) =>
            setEnteredPin(
              e.target.value.replace(/\D/g, "").slice(0, 4)
            )
          }
          className="mt-6 w-full rounded-2xl border border-stone-200 px-4 py-4 text-center text-2xl tracking-[10px]"
        />

        <button
          type="button"
          onClick={() => {
            const savedPin =
              localStorage.getItem("talkio_pin_code");

            if (enteredPin === savedPin) {
              setPinUnlocked(true);
            } else {
              alert("Incorrect PIN");
            }
          }}
          className="mt-5 w-full rounded-2xl bg-emerald-500 px-4 py-4 font-semibold text-white"
        >
          Unlock Talkio
        </button>
      </div>
    </main>
  );
}

  if (isSignedOut) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <div className="w-full max-w-sm rounded-[32px] bg-white p-8 shadow-sm ring-1 ring-stone-100">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
          Welcome to Talkio
        </h1>

        <p className="mt-5 text-base leading-7 text-stone-600">
          You don&apos;t have to carry it all alone.
        </p>

        <label className="mb-4 flex items-start gap-3 text-left">
  <input
    type="checkbox"
    checked={acceptedTerms}
    onChange={(e) => setAcceptedTerms(e.target.checked)}
    className="mt-1 h-5 w-5"
  />

  <span className="text-sm leading-6 text-stone-600">
    I agree to Talkio&apos;s{" "}
    <a href="/terms" className="font-medium text-emerald-700 underline">
      Terms
    </a>{" "}
    and{" "}
    <a href="/privacy" className="font-medium text-emerald-700 underline">
      Privacy Policy
    </a>
    .
  </span>
</label>

        <div className="mt-8 space-y-3">
          <button
  type="button"
  disabled={!acceptedTerms}
  onClick={() => {
    localStorage.setItem("talkio_after_signin_redirect", "/");
    window.location.href = "/settings/account?provider=google";
  }}
  className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-base font-semibold text-stone-900 shadow-sm disabled:opacity-50"
>
  Continue with Google
</button>

          <button
  type="button"
  disabled={!acceptedTerms}
  onClick={() => {
    localStorage.setItem("talkio_after_signin_redirect", "/");
    window.location.href = "/settings/account?provider=google";
  }}
  className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-4 text-base font-semibold text-stone-900 shadow-sm disabled:opacity-50"
>
  Continue with Apple 
</button>
        </div>

        <p className="mt-8 text-sm leading-6 text-stone-500">
          By continuing you agree to the{" "}
          <a href="/terms" className="font-medium text-emerald-700 underline">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="font-medium text-emerald-700 underline">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}

  return (
    <main className="mx-auto flex h-[100dvh] max-w-2xl flex-col text-stone-900">
      <style jsx global>{`
      @keyframes paywallSlideUp {
        from {
          opacity: 0;
          transform: translateY(14px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    `}</style>
      {showSafety && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="mb-3 text-lg font-semibold">Safety & Disclaimer</h2>

            <p className="mb-2 text-sm leading-relaxed text-stone-700">
              Talkio is an AI conversation tool for casual conversation and
              emotional support. It is not a therapist, doctor, or emergency
              service.
            </p>

            <p className="mb-2 text-sm leading-relaxed text-stone-700">
              If you feel unsafe or in immediate danger, please contact local
              emergency services or a qualified professional.
            </p>

            <p className="mb-4 text-sm leading-relaxed text-stone-700">
              By continuing, you understand and agree to use Talkio at your own
              discretion.
            </p>

            <button
              type="button"
              className="w-full rounded-none bg-emerald-500 px-4 py-2.5 text-white hover:bg-emerald-600"
              onClick={() => {
                localStorage.setItem(storageKeys.safety, "true");
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
          <div className="w-full max-w-md rounded-none bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold">Quick thing</h2>
            <p className="mb-3 text-sm text-stone-700">
              What nickname should I call you?
            </p>

            <input
              value={draftNickname}
              onChange={(e) => setDraftNickname(e.target.value)}
              placeholder="Enter a nickname"
              className="mb-3 w-full rounded-none border px-3 py-2.5 outline-none focus:border-emerald-500"
            />

            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-none border px-3 py-2.5"
                onClick={() => setShowNamePrompt(false)}
              >
                Skip
              </button>

              <button
                type="button"
                className="flex-1 rounded-none bg-emerald-500 px-3 py-2.5 text-white"
                onClick={saveNickname}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-none bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-lg font-semibold">Talkio Pro</h2>
            <p className="mb-4 text-sm text-stone-700">
              Unlimited chats will be available with Talkio Pro. For now, free
              messages reset tomorrow.
            </p>

            <button
              type="button"
              className="w-full rounded-none bg-emerald-500 px-4 py-2.5 text-white hover:bg-emerald-600"
              onClick={() => setShowUpgradeModal(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
      {showReviewPrompt && (
  <div className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-sm rounded-none border border-stone-200 bg-white/95 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)] backdrop-blur-xl">
    <button
      type="button"
      onClick={() => setShowReviewPrompt(false)}
      className="absolute right-4 top-4 text-lg text-stone-400 hover:text-stone-700"
      aria-label="Close review prompt"
    >
      ×
    </button>

    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-none bg-rose-100 text-2xl">
      💗
    </div>

    <h2 className="text-lg font-semibold text-stone-900">
      Enjoying Talkio?
    </h2>

    <p className="mt-2 text-sm leading-6 text-stone-600">
      If Talkio has helped you even a little, would you mind leaving a quick review?
    </p>

    <div className="mt-5 space-y-3">
      <button
        type="button"
        onClick={() => {
  localStorage.setItem("talkio_review_prompt_completed", "true");
  window.open(
    "https://play.google.com/store/apps/details?id=com.talkio.app",
    "_blank"
  );
  setShowReviewPrompt(false);
}}
        className="flex w-full items-center justify-between rounded-none border border-stone-200 bg-white px-4 py-3 text-left shadow-sm active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">▶️</span>
          <div>
            <p className="text-sm font-semibold text-stone-900">
              Review on Google Play
            </p>
            <p className="text-xs text-stone-500">
              It really helps us grow
            </p>
          </div>
        </div>
        <span className="text-xl text-stone-400">›</span>
      </button>

      <button
        type="button"
        onClick={() => {
  localStorage.setItem("talkio_review_prompt_completed", "true");
  window.open("https://apps.apple.com/", "_blank");
  setShowReviewPrompt(false);
}}
        className="flex w-full items-center justify-between rounded-none border border-stone-200 bg-white px-4 py-3 text-left shadow-sm active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl"></span>
          <div>
            <p className="text-sm font-semibold text-stone-900">
              Review on App Store
            </p>
            <p className="text-xs text-stone-500">
              It really helps us grow
            </p>
          </div>
        </div>
        <span className="text-xl text-stone-400">›</span>
      </button>
    </div>

    <button
      type="button"
      onClick={() => setShowReviewPrompt(false)}
      className="mt-5 w-full text-center text-sm font-medium text-stone-500 hover:text-stone-800"
    >
      Maybe later
    </button>
  </div>
)}

  <div className="relative z-20 flex items-start justify-between gap-3 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+64px)]">
  <div>
    <h1 className="text-[2.15rem] font-semibold tracking-[-0.04em]">Talkio</h1>
    <p className="mt-1 text-sm text-stone-500">
  Reflect, breathe, move forward
</p>
  </div>

  <div className="relative z-30 flex shrink-0 items-center gap-2 pt-1">
  <button
    type="button"
    className="rounded-none border border-stone-200 bg-white/60 backdrop-blur-md px-3 py-2 text-sm transition-all duration-200 active:rotate-12 active:scale-95 active:bg-emerald-50 hover:bg-stone-100"
    onClick={() => (window.location.href = "/settings")}
  >
    ⚙️
  </button>

  <button
    type="button"
    className="rounded-none border border-stone-200 bg-white/60 backdrop-blur-md px-3 py-2 text-sm transition-all duration-200 active:scale-95 active:bg-red-50 hover:bg-stone-100 disabled:opacity-50"
    disabled={loading || messages.length <= 1}
    onClick={clearChat}
  >
    Clear 
  </button>
</div>
</div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 md:px-10">
        <div className="flex flex-col gap-2">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];

            const sameAsPrev = prev?.role === m.role;
            const sameAsNext = next?.role === m.role;
            const showTimestamp = !next || next.role !== m.role;

            if (
  isLimitReached &&
  m.role === "assistant" &&
  typeof m.content === "string" &&
  m.content.includes("free limit")
) {
  return null;
}

const isFirstUserReply =
  m.role === "user" &&
  i === 1 &&
  messages[0]?.role === "assistant";

let bubbleClass =
  m.role === "user"
    ? isFirstUserReply
      ? "talkio-user-bubble self-end mr-4 max-w-[70%] px-4 py-3"
      : "talkio-user-bubble self-end mr-4 max-w-[74%] px-4 py-3"
      : "talkio-ai-bubble self-start ml-4 max-w-[74%] px-4 py-3";

if (m.role === "user") {
  if (sameAsPrev) bubbleClass += " rounded-tr-md";
  if (sameAsNext) bubbleClass += " rounded-br-md";
} else {
  if (sameAsPrev) bubbleClass += " rounded-tl-md";
  if (sameAsNext) bubbleClass += " rounded-bl-md";
}

            return (              
              <div key={i} className="flex flex-col">
                <div className={bubbleClass}>
                  <div className="whitespace-pre-wrap break-words text-[17px] leading-[1.45]">
                    {m.content}
                  </div>
                </div>

                {showTimestamp && (
                  <div
                    className={
                      m.role === "user"
                        ? "mt-2 self-end px-4 text-[12px] text-stone-300"
                        : "mt-2 self-start px-4 text-[12px] text-stone-300"
                    }
                  >
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {isLimitReached && (
  <div className="pointer-events-none fixed bottom-20 left-0 right-0 z-40 px-4">
    <div className="pointer-events-auto mx-auto flex max-w-md animate-[paywallSlideUp_260ms_ease-out] items-center justify-between gap-3 rounded-[24px] border border-stone-200 bg-white/90 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.12)] backdrop-blur-xl">
      <div>
        <p className="text-sm font-semibold text-stone-900">
          Daily limit reached
        </p>
        <div className="mt-1 space-y-1">
  <p className="text-xs font-medium text-stone-800">
    Your free messages for today are finished.
  </p>

  <p className="text-xs leading-5 text-stone-500">
    Talkio Pro keeps the conversation going with higher limits, deeper memory, and scheduled check-ins.
  </p>
</div>
      </div>

      <button
        type="button"
        onClick={() => (window.location.href = "/paywall")}
        className="shrink-0 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white active:scale-95 transition"
      >
        Upgrade
      </button>
    </div>
  </div>
)}

          {showTyping && (
            <div className="talkio-ai-bubble ml-6 self-start max-w-[78%] px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400" />
              </div>
            </div>
          )}
        
          {messages.length === 1 &&
            !loading &&
            !isLimitReached &&
            !showSafety && (
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  "I'm stressed",
                  "I can't sleep",
                  "Just bored",
                  "Something happened today",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
                    onClick={() => sendMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

          <div ref={bottomRef} />
        </div>
      </div>

      {!isLimitReached && (
  <>
    {crisisLock && (
      <div className="mx-3 mb-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
        <p>
          Talkio paused this conversation because it mentioned serious violence or immediate harm. If anyone may be in danger, contact local emergency services now.
        </p>

        <button
          type="button"
          onClick={clearChat}
          className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm"
        >
          Start new conversation
        </button>
      </div>
    )}

    <form
  className="sticky bottom-0 z-40 flex shrink-0 items-end gap-2 border-t border-stone-200 bg-[#f7f1e8]/95 px-3 pb-2 pt-2"
  onSubmit={(e) => {
    e.preventDefault();
    sendMessage();
  }}
>
  <div className="talkio-input flex min-h-[44px] flex-1 items-end border border-stone-300 bg-white px-3 py-2 rounded-md">
      <textarea
        ref={inputRef}
        value={input}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
        setInput(e.target.value);

        e.target.style.height = "32px";
        const nextHeight = Math.min(e.target.scrollHeight, 92);
        e.target.style.height = `${nextHeight}px`;
        e.target.style.overflowY =
          e.target.scrollHeight > 92 ? "auto" : "hidden";
      }}
      placeholder={
        crisisLock
          ? "Chat paused for safety"
          : isLimitReached
            ? "Daily free limit reached."
            : "Type your message..."
      }
      disabled={loading || showSafety || crisisLock || isLimitReached}
      rows={1}
      className="h-[32px] max-h-[92px] w-full resize-none border-0 bg-transparent p-0 text-[16px] leading-6 outline-none placeholder:text-stone-400"
      style={{
        borderRadius: "0px",
        WebkitAppearance: "none",
        appearance: "none",
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).form?.requestSubmit();
        }
      }}
    />
  </div>

  <button
  type="submit"
  disabled={
    loading ||
    showSafety ||
    crisisLock ||
    isLimitReached ||
    !input.trim()
  }
  className="h-[48px] min-w-[64px] rounded-md bg-[#78906f] px-4 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
>
  Send
</button>
</form>

  </>
      )}
    </main>
  );
}