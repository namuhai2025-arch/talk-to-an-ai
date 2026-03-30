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

function buildReminderMessage(reminder, memoryItems = []) {
  const category = reminder?.category || inferReminderCategory(reminder);
  const tone = inferTone(memoryItems);
  const anchor = extractPersonalAnchor(memoryItems, category);
  const base = String(reminder?.text || "you set a reminder").trim();

  const titleMap = {
    health: ["Take care of yourself", "Quick health nudge", "Health reminder"],
    work: ["Quick work nudge", "Stay on top of it", "Work reminder"],
    wellbeing: ["Small reset", "Take a moment", "Well-being reminder"],
    general: ["Reminder", "Quick nudge", "Just a reminder"],
  };

  const bodyMap = {
    health: {
      calm: [
        `Just a gentle nudge — ${base}.`,
        `A small reminder for you: ${base}.`,
        `Time for ${base}.`,
      ],
      short: [
        `${base}.`,
        `Time for ${base}.`,
        `Quick nudge: ${base}.`,
      ],
      neutral: [
        `Hey, just a quick nudge — ${base}.`,
        `Friendly reminder: ${base}.`,
        `Time to do this: ${base}.`,
      ],
    },
    work: {
      calm: [
        `Just a steady reminder — ${base}.`,
        `A quick nudge for later: ${base}.`,
        `Time to handle this: ${base}.`,
      ],
      short: [
        `${base}.`,
        `Quick reminder: ${base}.`,
        `Time for ${base}.`,
      ],
      neutral: [
        `Quick reminder — ${base}.`,
        `Just a nudge: ${base}.`,
        `This is your reminder: ${base}.`,
      ],
    },
    wellbeing: {
      calm: [
        `Take a moment — ${base}.`,
        `A gentle pause for you: ${base}.`,
        `Just a soft reminder: ${base}.`,
      ],
      short: [
        `${base}.`,
        `Take a moment: ${base}.`,
        `Quick reset: ${base}.`,
      ],
      neutral: [
        `Just a quick reset reminder — ${base}.`,
        `Here’s your reminder: ${base}.`,
        `Time for ${base}.`,
      ],
    },
    general: {
      calm: [
        `Just a gentle reminder — ${base}.`,
        `A small nudge for you: ${base}.`,
        `Time for ${base}.`,
      ],
      short: [
        `${base}.`,
        `Reminder: ${base}.`,
        `Quick nudge: ${base}.`,
      ],
      neutral: [
        `Just a quick reminder — ${base}.`,
        `Here’s your reminder: ${base}.`,
        `Quick nudge: ${base}.`,
      ],
    },
  };

  const title = pick(titleMap[category] || titleMap.general);
  const bodyCore = pick(
    (bodyMap[category] && bodyMap[category][tone]) || bodyMap.general.neutral
  );

  const body = anchor ? `${bodyCore} ${anchor}` : bodyCore;

  return {
    title,
    body,
    category,
    tone,
  };
}

module.exports = {
  buildReminderMessage,
  inferReminderCategory,
};