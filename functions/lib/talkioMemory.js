const { Timestamp } = require("firebase-admin/firestore");

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

const defaultTalkioUserProfile = {
  name: null,
  nickname: null,
  preferredLanguage: "Taglish",
  conversationStyle: "warm, casual, short replies",
  importantPeople: [],
  commonTopics: [],
  recentMoodTrend: "",
  repeatingFeelings: [],
  commonTriggers: [],
  comfortStyle: ["gentle humor", "light reassurance"],
  lastOpenLoop: null,
  updatedAt: null,
};

function createDefaultEmotionDay(date) {
  return {
    date,
    dominantMood: "neutral",
    moodScore: 0,
    themes: [],
    notableTrigger: null,
    helpfulResponseStyle: ["gentle humor", "soft check-in"],
    summary: "",
    updatedAt: null,
  };
}

function userProfileRef(db, uid) {
  return db.doc(`users/${uid}/core/profile`);
}

function emotionDayRef(db, uid, date) {
  return db.doc(`users/${uid}/emotionDays/${date}`);
}

async function getTalkioUserProfile(db, uid) {
  const ref = userProfileRef(db, uid);
  const snap = await ref.get();

  if (!snap.exists) {
    return defaultTalkioUserProfile;
  }

  return {
    ...defaultTalkioUserProfile,
    ...snap.data(),
  };
}

async function getRecentEmotionDays(db, uid, days = 5) {
  const snap = await db
    .collection(`users/${uid}/emotionDays`)
    .orderBy("date", "desc")
    .limit(days)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      ...createDefaultEmotionDay(doc.id),
      ...data,
    };
  });
}

async function getTalkioMemoryBundle(db, uid, recentDays = 5) {
  const [profile, recentEmotionDays] = await Promise.all([
    getTalkioUserProfile(db, uid),
    getRecentEmotionDays(db, uid, recentDays),
  ]);

  return {
    profile,
    recentEmotionDays,
  };
}

function buildTalkioMemorySummary(memory) {
  const profile = memory?.profile || defaultTalkioUserProfile;
  const recentEmotionDays = Array.isArray(memory?.recentEmotionDays)
    ? memory.recentEmotionDays
    : [];

  const recentDaysSummary = recentEmotionDays
    .map((day) => {
      const bits = [
        `date: ${day.date}`,
        `mood: ${day.dominantMood}`,
        `moodScore: ${day.moodScore}`,
        Array.isArray(day.themes) && day.themes.length
          ? `themes: ${day.themes.join(", ")}`
          : "",
        day.notableTrigger ? `trigger: ${day.notableTrigger}` : "",
        day.summary ? `summary: ${day.summary}` : "",
      ].filter(Boolean);

      return `- ${bits.join(" | ")}`;
    })
    .join("\n");

  return `
TALKIO MEMORY

User profile:
- name: ${profile.name || "unknown"}
- nickname: ${profile.nickname || "unknown"}
- preferredLanguage: ${profile.preferredLanguage || "unknown"}
- conversationStyle: ${profile.conversationStyle || "unknown"}
- importantPeople: ${
    Array.isArray(profile.importantPeople) && profile.importantPeople.length
      ? profile.importantPeople.join(", ")
      : "none"
  }
- commonTopics: ${
    Array.isArray(profile.commonTopics) && profile.commonTopics.length
      ? profile.commonTopics.join(", ")
      : "none"
  }
- recentMoodTrend: ${profile.recentMoodTrend || "unknown"}
- repeatingFeelings: ${
    Array.isArray(profile.repeatingFeelings) && profile.repeatingFeelings.length
      ? profile.repeatingFeelings.join(", ")
      : "none"
  }
- commonTriggers: ${
    Array.isArray(profile.commonTriggers) && profile.commonTriggers.length
      ? profile.commonTriggers.join(", ")
      : "none"
  }
- comfortStyle: ${
    Array.isArray(profile.comfortStyle) && profile.comfortStyle.length
      ? profile.comfortStyle.join(", ")
      : "none"
  }
- lastOpenLoop: ${profile.lastOpenLoop || "none"}

Recent emotional days:
${recentDaysSummary || "- none"}

Instruction:
Use this memory gently and naturally.
Do not list memory mechanically.
Use it only when relevant to make the user feel remembered, cared for, and understood over time.
`.trim();
}

async function updateTalkioUserProfile(db, uid, updates) {
  const ref = userProfileRef(db, uid);

  await ref.set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

async function updateEmotionDay(db, uid, date, updates) {
  const ref = emotionDayRef(db, uid, date);

  await ref.set(
    {
      ...updates,
      date,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

module.exports = {
  getTodayDateString,
  getTalkioMemoryBundle,
  buildTalkioMemorySummary,
  updateTalkioUserProfile,
  updateEmotionDay,
};