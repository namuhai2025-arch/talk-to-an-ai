// functions/reminders/extractors.js

function classifyReminder(text) {
  const lower = String(text || "").toLowerCase();

  if (
    lower.includes("bone broth") ||
    lower.includes("vitamin") ||
    lower.includes("medicine") ||
    lower.includes("water") ||
    lower.includes("gym") ||
    lower.includes("workout")
  ) {
    return "health";
  }

  if (
    lower.includes("meeting") ||
    lower.includes("email") ||
    lower.includes("report") ||
    lower.includes("deadline") ||
    lower.includes("work")
  ) {
    return "work";
  }

  if (
    lower.includes("sleep") ||
    lower.includes("rest") ||
    lower.includes("breathe") ||
    lower.includes("walk")
  ) {
    return "wellbeing";
  }

  return "general";
}

function parseHourMinute(text) {
  const input = String(text || "").toLowerCase();

  let match = input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const ampm = match[3].toLowerCase();

    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;

    return { hour, minute };
  }

  match = input.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/i);
  if (match) {
    return {
      hour: Number(match[1]),
      minute: Number(match[2] || 0),
    };
  }

  return null;
}

function parseDateBase(text, now = new Date()) {
  const input = String(text || "").toLowerCase();
  const base = new Date(now);

  if (input.includes("tomorrow")) {
    base.setDate(base.getDate() + 1);
    return base;
  }

  if (input.includes("today")) {
    return base;
  }

  if (input.includes("tonight")) {
    return base;
  }

  return null;
}

function extractReminderText(text) {
  const input = String(text || "").trim();

  let cleaned = input
    .replace(/^remind me\b/i, "")
    .replace(/\bin\s+\d+\s*(minute|minutes|hour|hours)\b/i, "")
    .replace(/\btomorrow\b/i, "")
    .replace(/\btoday\b/i, "")
    .replace(/\btonight\b/i, "")
    .replace(/\bat\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/i, "")
    .replace(/\bevery day\b/i, "")
    .replace(/\bdaily\b/i, "")
    .trim();

  cleaned = cleaned.replace(/^to\s+/i, "").trim();

  return cleaned || "Reminder";
}
function parseRelativeTime(text, now = new Date()) {
  const lower = String(text || "").toLowerCase();

  let match = lower.match(/in\s+(\d+)\s+minute/);
  if (match) {
    const minutes = Number(match[1]);
    return new Date(now.getTime() + minutes * 60 * 1000);
  }

  match = lower.match(/in\s+(\d+)\s+hour/);
  if (match) {
    const hours = Number(match[1]);
    return new Date(now.getTime() + hours * 60 * 60 * 1000);
  }

  return null;
}

function detectReminderCommand(message) {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();

  if (!lower.startsWith("remind me")) return null;

  // Relative time support: "in 2 minutes", "in 1 hour"
  const relativeMatch = text.match(/in\s+(\d+)\s*(minute|minutes|hour|hours)/i);
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();

    let ms = 0;
    if (unit.includes("minute")) {
      ms = value * 60 * 1000;
    } else if (unit.includes("hour")) {
      ms = value * 60 * 60 * 1000;
    }

    const scheduled = new Date(Date.now() + ms);
    const reminderText = extractReminderText(text);
    const category = classifyReminder(reminderText);

    return {
      type: "reminder_intent",
      valid: true,
      text: reminderText,
      scheduledAt: scheduled,
      repeat: "none",
      category,
      sourceMessage: text,
    };
  }

  const relativeTime = parseRelativeTime(text);
  const time = parseHourMinute(text);
  const dateBase = parseDateBase(text);
  const reminderText = extractReminderText(text);
  const category = classifyReminder(reminderText);

  let repeat = "none";
  if (lower.includes("every day") || lower.includes("daily")) {
    repeat = "daily";
  }

  if (!dateBase && repeat === "none") {
    return {
      type: "reminder_intent",
      valid: false,
      reason: "missing_date",
      text: reminderText,
    };
  }

  if (!time) {
    return {
      type: "reminder_intent",
      valid: false,
      reason: "missing_time",
      text: reminderText,
    };
  }

  let scheduled;

if (relativeTime) {
  scheduled = relativeTime;
} else {
  scheduled = new Date(dateBase || new Date());
  scheduled.setHours(time.hour, time.minute, 0, 0);
}

  // If "tonight" or "today" and time already passed → move to tomorrow
  const nowTime = new Date();

  if (
    (lower.includes("tonight") || lower.includes("today")) &&
    scheduled.getTime() <= nowTime.getTime()
  ) {
    scheduled.setDate(scheduled.getDate() + 1);
  }

  return {
    type: "reminder_intent",
    valid: true,
    text: reminderText,
    scheduledAt: scheduled,
    repeat,
    category,
    sourceMessage: text,
  };
}

module.exports = {
  detectReminderCommand,
};