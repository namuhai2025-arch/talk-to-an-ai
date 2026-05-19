// functions/reminders/messageBuilder.js

function pick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function inferReminderCategory(reminder) {
  const text = normalize(reminder?.text);

  if (
    text.includes("bone broth") ||
    text.includes("vitamin") ||
    text.includes("medicine") ||
    text.includes("water") ||
    text.includes("workout") ||
    text.includes("gym")
  ) {
    return "health";
  }

  if (
    text.includes("meeting") ||
    text.includes("report") ||
    text.includes("deadline") ||
    text.includes("email") ||
    text.includes("work")
  ) {
    return "work";
  }

  if (
    text.includes("sleep") ||
    text.includes("rest") ||
    text.includes("breathe") ||
    text.includes("walk")
  ) {
    return "wellbeing";
  }

  return "general";
}

function inferTone(memoryItems = []) {
  const values = memoryItems.map((m) => normalize(m.value)).join(" ");

  if (
    values.includes("prefers calm replies") ||
    values.includes("calm")
  ) {
    return "calm";
  }

  if (
    values.includes("prefers short replies") ||
    values.includes("short replies")
  ) {
    return "short";
  }

  return "neutral";
}

function extractPersonalAnchor(memoryItems = [], category = "general") {
  const joined = memoryItems.map((m) => ({
    type: m.type,
    value: String(m.value || ""),
    tags: Array.isArray(m.tags) ? m.tags : [],
  }));

  if (category === "health") {
    const goal = joined.find((m) =>
      normalize(m.value).includes("lose weight") ||
      normalize(m.value).includes("health")
    );
    if (goal) return "You said this matters to your health.";
  }

  if (category === "work") {
    const goal = joined.find((m) =>
      normalize(m.value).includes("work") ||
      normalize(m.value).includes("focus")
    );
    if (goal) return "A small step now can keep the day cleaner.";
  }

  const routine = joined.find((m) => m.type === "routine");
  if (routine) return "You wanted to stay consistent with this.";

  return "";
}

function inferEmotionalReminderState(memoryItems = []) {
  const values = memoryItems.map((m) => normalize(m.value)).join(" ");

  if (/\b(stressed|overwhelmed|anxious|panic|tired|exhausted|burned out)\b/i.test(values)) {
    return "strained";
  }

  if (/\b(sad|lonely|hurt|grief|heavy|broken|empty)\b/i.test(values)) {
    return "tender";
  }

  if (/\b(grateful|proud|happy|excited|hopeful|better)\b/i.test(values)) {
    return "uplifted";
  }

  return "steady";
}

function buildReminderMessage(reminder, memoryItems = []) {
  const category = reminder?.category || inferReminderCategory(reminder);
  const tone = inferTone(memoryItems);
  const emotionalState = inferEmotionalReminderState(memoryItems);
  const anchor = extractPersonalAnchor(memoryItems, category);
  const base = String(reminder?.text || "this").trim();

  // 🧠 Natural openers (feels human, not system)
  const openers = [
    "hey —",
    "just a quick one —",
    "a small nudge —",
    "",
  ];

  // 🧠 Core message (no robotic phrasing)
  const coreLines = [
    `${base}.`,
    `this might be a good moment for ${base}.`,
    `you might want to check in on ${base}.`,
    `maybe circle back to ${base}.`,
  ];

  // 🧠 Soft closers (Talkio tone)
  const closers = [
    "",
    "no pressure.",
    "just keeping it light.",
    "take it easy with it.",
  ];

  const opener = pick(openers);
  const core = pick(coreLines);
  const closer = pick(closers);

  let body = [opener, core, anchor, closer]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // ✨ Tone adjustment
  if (tone === "short") {
    body = `${base}.`;
  }

  if (tone === "calm") {
    body = body.replace("hey —", "just gently —");
  }

  // 🧠 Title (less system-like)
  const titles = [
    "just a small nudge",
    "quick reminder",
    "hey",
    "",
  ];

  const title = pick(titles) || "quick reminder";

  if (emotionalState === "strained") {
  body = `${body} Keep it small for now.`;
}

if (emotionalState === "tender") {
  body = `${body} Gently, okay.`;
}

if (emotionalState === "uplifted") {
  body = `${body} Nice to keep that momentum softly.`;
}

  return {
  title,
  body,
  category,
  tone,
  emotionalState,
  };
}

module.exports = {
  buildReminderMessage,
  inferReminderCategory,
  inferEmotionalReminderState,
};