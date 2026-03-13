export type UserTier = "free" | "premium";
export type ReplyType = "greeting" | "thanks" | "short";

export type ReplyHistoryItem = {
  text: string;
  timestamp: number;
};

export type ClassifierResult =
  | { type: "local"; reply: string; replyHistory: ReplyHistoryItem[] }
  | { type: "ai"; model: "cheap_model" | "premium_model"; replyHistory: ReplyHistoryItem[] };

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REPLY_HISTORY = 50;
const NICKNAME_USE_CHANCE = 0.35;

const LOCAL_REPLIES: Record<ReplyType, string[]> = {
  greeting: [
    "Hey, I'm here. How’s your day going?",
    "Hi there. What’s on your mind today?",
    "Hello. Want to talk about anything or just hang out?",
    "Hi. I'm really glad you stopped by. How are you feeling today?",
    "Hey there. I'm here with you. What’s been going on lately?",
    "Hello. It's nice hearing from you. How’s your day treating you?",
    "Hi. Do you feel like chatting about something today?",
    "Hey. I'm here if you want to share what’s on your mind.",
    "Hi there. How are things going for you today?",
    "Hello. It's good to see you here.",
    "Hey, {name}. I’m here. How’s your day going?",
    "Hi, {name}. What’s been on your mind today?",
    "Hello, {name}. Want to talk for a bit?",
    "Hey there, {name}. I’m glad you’re here.",
    "Hi, {name}. How are things feeling today?"
  ],

  thanks: [
    "You're welcome. I'm always here to listen.",
    "No problem at all. Want to talk about anything else?",
    "Glad I could help a little.",
    "You're always welcome here.",
    "Of course. I'm really glad you shared that with me.",
    "Anytime. I'm here whenever you need someone to talk to.",
    "It means a lot that you shared that with me.",
    "I'm happy to listen anytime.",
    "You’re welcome, {name}.",
    "Anytime, {name}. I’m here for you.",
    "Of course, {name}."
  ],

  short: [
    "Got it. What’s been going on with you?",
    "Alright. Tell me more.",
    "Okay. I'm listening.",
    "I hear you. Want to say a little more about that?",
    "Alright. I'm here with you.",
    "Okay. I'm following you.",
    "I see. Go on.",
    "Hmm. I'm listening.",
    "Alright, {name}. I’m listening.",
    "Okay, {name}. Tell me more.",
    "I hear you, {name}."
  ]
};

const GREETING_PATTERNS = [
  /\bhi\b/,
  /\bhello\b/,
  /\bhey\b/,
  /\bgood morning\b/,
  /\bgood afternoon\b/,
  /\bgood evening\b/,
  /\bhiya\b/,
  /\bhey there\b/
];

const THANKS_PATTERNS = [
  /\bthanks\b/,
  /\bthank you\b/,
  /\bthanks so much\b/,
  /\bthank you so much\b/,
  /\bappreciate it\b/,
  /\bty\b/
];

const SHORT_PATTERNS = [
  /\bok\b/,
  /\bokay\b/,
  /\bsure\b/,
  /\bhaha\b/,
  /\blol\b/,
  /\bnice\b/,
  /\byeah\b/,
  /\byup\b/,
  /\bmm\b/,
  /\bhmm\b/
];

const CHECK_IN_PATTERNS = [
  /\bare you there\b/,
  /\byou there\b/,
  /\banyone there\b/,
  /\btalkio\b/
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  return text ? text.split(/\s+/).length : 0;
}

function isMostlyShortMessage(message: string): boolean {
  return countWords(normalize(message)) <= 5;
}

function matchesAnyPattern(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

function isGreetingMessage(message: string): boolean {
  const normalized = normalize(message);
  if (!isMostlyShortMessage(normalized)) return false;
  return matchesAnyPattern(normalized, GREETING_PATTERNS);
}

function isThanksMessage(message: string): boolean {
  const normalized = normalize(message);
  if (!isMostlyShortMessage(normalized)) return false;
  return matchesAnyPattern(normalized, THANKS_PATTERNS);
}

function isShortAcknowledgement(message: string): boolean {
  const normalized = normalize(message);
  if (!isMostlyShortMessage(normalized)) return false;
  return matchesAnyPattern(normalized, SHORT_PATTERNS);
}

function isCheckInMessage(message: string): boolean {
  const normalized = normalize(message);
  if (!isMostlyShortMessage(normalized)) return false;
  return matchesAnyPattern(normalized, CHECK_IN_PATTERNS);
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function maybeInsertName(template: string, nickname?: string): string {
  const cleanName = (nickname || "").trim();

  if (!template.includes("{name}")) {
    return template;
  }

  if (!cleanName) {
    return template.replace(/,?\s*\{name\}/g, "").trim();
  }

  return template.replace(/\{name\}/g, cleanName);
}

function filterRecentReplies(
  replies: string[],
  history: ReplyHistoryItem[]
): string[] {
  const now = Date.now();

  const recent = new Set(
    history
      .filter((item) => now - item.timestamp < ONE_WEEK_MS)
      .map((item) => item.text)
  );

  return replies.filter((reply) => !recent.has(reply));
}

function trimReplyHistory(history: ReplyHistoryItem[]) {
  if (history.length > MAX_REPLY_HISTORY) {
    history.splice(0, history.length - MAX_REPLY_HISTORY);
  }
}

function pickReply(
  type: ReplyType,
  replyHistory: ReplyHistoryItem[],
  nickname?: string
): string {
  const replies = LOCAL_REPLIES[type];
  let pool = filterRecentReplies(replies, replyHistory);

  if (pool.length === 0) {
    pool = replies;
  }

  const withName = pool.filter((reply) => reply.includes("{name}"));
  const withoutName = pool.filter((reply) => !reply.includes("{name}"));

  let chosenTemplate: string;

  if (nickname?.trim() && withName.length > 0 && Math.random() < NICKNAME_USE_CHANCE) {
    chosenTemplate = randomItem(withName);
  } else if (withoutName.length > 0) {
    chosenTemplate = randomItem(withoutName);
  } else {
    chosenTemplate = randomItem(pool);
  }

  replyHistory.push({
    text: chosenTemplate,
    timestamp: Date.now()
  });

  trimReplyHistory(replyHistory);

  return maybeInsertName(chosenTemplate, nickname);
}

function checkLocalReply(
  message: string,
  replyHistory: ReplyHistoryItem[],
  nickname?: string
): string | null {
  if (isGreetingMessage(message)) {
    return pickReply("greeting", replyHistory, nickname);
  }

  if (isThanksMessage(message)) {
    return pickReply("thanks", replyHistory, nickname);
  }

  if (isShortAcknowledgement(message) || isCheckInMessage(message)) {
    return pickReply("short", replyHistory, nickname);
  }

  return null;
}

function isDuplicate(message: string, lastMessage?: string): boolean {
  if (!lastMessage) return false;
  return normalize(message) === normalize(lastMessage);
}

function routeModel(userTier: UserTier): "cheap_model" | "premium_model" {
  return userTier === "premium" ? "premium_model" : "cheap_model";
}

export function classifyMessage(params: {
  message: string;
  lastMessage?: string;
  userTier: UserTier;
  replyHistory?: ReplyHistoryItem[];
  nickname?: string;
}): ClassifierResult {
  const {
    message,
    lastMessage,
    userTier,
    replyHistory = [],
    nickname
  } = params;

  const localReply = checkLocalReply(message, replyHistory, nickname);

  if (localReply) {
    return {
      type: "local",
      reply: localReply,
      replyHistory
    };
  }

  if (isDuplicate(message, lastMessage)) {
    return {
      type: "local",
      reply: nickname?.trim()
        ? `You sent that again, ${nickname}. I’m still here with you.`
        : "You sent that again. I’m still here with you.",
      replyHistory
    };
  }

  return {
    type: "ai",
    model: routeModel(userTier),
    replyHistory
  };
}