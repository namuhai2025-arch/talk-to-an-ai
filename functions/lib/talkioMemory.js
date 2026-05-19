const { Timestamp } = require("firebase-admin/firestore");

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

const defaultTalkioProfile = {
  recentMoodTrend: "",
  commonEmotionalStates: [],
  supportStyle: [],

  styleProfile: {
    warmth: "medium",
    depth: "balanced",
    energy: "calm",
    encouragement: "gentle",
    humor: "minimal",
    replyLength: "medium",
    questionPreference: "sometimes",
    languageStyle: "mirror_user",
    preferredLanguage: "auto",
    confidence: "low",
  },

  styleSignals: {
    playfulCount: 0,
    shortReplyCount: 0,
    mixedLanguageCount: 0,
    lowQuestionCount: 0,
    deepReflectionCount: 0,
  },

  behaviorProfile: {
    replyStyle: "balanced",
    tonePreference: "calm",
    languagePreference: "english",
    languageMirroring: "single_language",
    humorPreference: "low",
    structurePreference: "medium",
    emotionalPacing: "steady",
  },

  behaviorSignals: {
    shortMessageCount: 0,
    longMessageCount: 0,
    playfulCount: 0,
    seriousCount: 0,
    taglishCount: 0,
    englishCount: 0,
    spanishCount: 0,
    mixedLanguageCount: 0,
    emotionalIntensityHighCount: 0,
    emotionalIntensityLowCount: 0,
    directPreferenceCount: 0,
    gentlePreferenceCount: 0,
  },

  emotionalContinuityProfile: {
    dominantEmotionalPattern: "steady",
    emotionalLoad: "light",
    continuityNeed: "low",
    followUpStyle: "gentle",
  },

  emotionalContinuitySignals: {
    overwhelmedCount: 0,
    lowCount: 0,
    drainedCount: 0,
    agitatedCount: 0,
    settlingCount: 0,
    neutralCount: 0,
    highWeightCount: 0,
    mediumWeightCount: 0,
    lowWeightCount: 0,
    unresolvedTopicCount: 0,
    lastUpdatedAt: 0,
  },

  memory: {
    recurringThemes: [],
    emotionalPatterns: [],
    importantPeople: [],
    recentSummary: "",
  },
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

  preferredTone: "warm_light",
  preferredReplyLength: "short",
  likesHumorWhenSad: false,
  likesDirectAdvice: false,

  commonEmotionalStates: [],
  frequentTimePattern: "",
  supportStyle: ["gentle reassurance"],
  relationshipStyle: "soft companion",

  openLoops: [],

  recentRelationalContext: {
    lastEmotionalTone: "",
    lastSupportNeed: "",
    lastConversationVibe: "",
    lastCheckInWorthyTopic: "",
  },

  updatedAt: null,
};

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
  const profile = memory?.profile || defaultTalkioProfile;
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
- preferredTone: ${profile.preferredTone || "unknown"}
- preferredReplyLength: ${profile.preferredReplyLength || "unknown"}
- likesHumorWhenSad: ${String(profile.likesHumorWhenSad)}
- likesDirectAdvice: ${String(profile.likesDirectAdvice)}
- commonEmotionalStates: ${
    Array.isArray(profile.commonEmotionalStates) &&
    profile.commonEmotionalStates.length
      ? profile.commonEmotionalStates.join(", ")
      : "none"
  }
- frequentTimePattern: ${profile.frequentTimePattern || "unknown"}
- supportStyle: ${
    Array.isArray(profile.supportStyle) && profile.supportStyle.length
      ? profile.supportStyle.join(", ")
      : "none"
  }
- relationshipStyle: ${profile.relationshipStyle || "unknown"}
- openLoops: ${
    Array.isArray(profile.openLoops) && profile.openLoops.length
      ? profile.openLoops
          .map((loop) => `${loop.topic}: ${loop.summary}`)
          .join(" | ")
      : "none"
  }
- recentRelationalContext: ${
    profile.recentRelationalContext
      ? `tone=${profile.recentRelationalContext.lastEmotionalTone || "unknown"}, supportNeed=${profile.recentRelationalContext.lastSupportNeed || "unknown"}, vibe=${profile.recentRelationalContext.lastConversationVibe || "unknown"}, followUp=${profile.recentRelationalContext.lastCheckInWorthyTopic || "none"}`
      : "none"
  }

Recent emotional days:
${recentDaysSummary || "- none"}

Instruction:
Use this memory gently and naturally.
Do not list memory mechanically.
Use it only when relevant to make the user feel remembered, cared for, and understood over time.
`.trim();
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

function updateStyleSignals(userMessage, signals = {}) {
  const text = (userMessage || "").trim().toLowerCase();

  const next = {
    playfulCount: signals.playfulCount || 0,
    shortReplyCount: signals.shortReplyCount || 0,
    mixedLanguageCount: signals.mixedLanguageCount || 0,
    lowQuestionCount: signals.lowQuestionCount || 0,
    deepReflectionCount: signals.deepReflectionCount || 0,
  };

  if (/haha|hehe|lol|😂|🤣|😅/.test(text)) {
    next.playfulCount += 1;
  }

  if (text.length < 40) {
    next.shortReplyCount += 1;
  }

  if (/ na | naman | kasi | lang | talaga /.test(text)) {
    next.mixedLanguageCount += 1;
  }

  if (!text.includes("?")) {
    next.lowQuestionCount += 1;
  }

  if (text.length > 140) {
    next.deepReflectionCount += 1;
  }

  return next;
}

function deriveStyleProfileFromSignals(signals, currentProfile) {
  const next = { ...currentProfile };

  if ((signals.playfulCount || 0) >= 4) {
    next.humor = "playful";
  }

  if ((signals.shortReplyCount || 0) >= 5) {
    next.replyLength = "short";
  }

  if ((signals.mixedLanguageCount || 0) >= 4) {
    next.languageStyle = "mixed_casual";
  }

  if ((signals.lowQuestionCount || 0) >= 6) {
    next.questionPreference = "rare";
  }

  if ((signals.deepReflectionCount || 0) >= 4) {
    next.depth = "deep";
  }

  const score =
    (signals.playfulCount || 0) +
    (signals.shortReplyCount || 0) +
    (signals.mixedLanguageCount || 0);

  if (score >= 10) next.confidence = "high";
  else if (score >= 5) next.confidence = "medium";

  return next;
}

function buildStyleProfileBlock(profile) {
  const p = profile?.styleProfile || {};

  return `
USER STYLE PROFILE

Preferred warmth: ${p.warmth}
Preferred depth: ${p.depth}
Preferred humor style: ${p.humor}
Preferred reply length: ${p.replyLength}
Question preference: ${p.questionPreference}
Language style: ${p.languageStyle}
Confidence: ${p.confidence}

Use this profile gently.
Do not follow it rigidly.
Prioritize the user's current emotional state.
`.trim();
}

async function updateTalkioUserProfile(db, uid, updates) {
  const ref = db.collection("talkioUserProfiles").doc(uid);

  await ref.set(
    {
      ...updates,
      updatedAt: Date.now(),
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
  defaultTalkioProfile,
  defaultTalkioUserProfile, // ✅ ADD THIS
  updateStyleSignals,
  deriveStyleProfileFromSignals,
  buildStyleProfileBlock,
};