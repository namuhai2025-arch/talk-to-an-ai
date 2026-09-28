"use strict";

const TALKIO_PLANS = {
  free: {
    label: "Free",
    price: 0,

    // limits
    dailyMessageLimit: 10,
    trialDays: 3,

    // behavior
    replyLength: "moderate",
    replyDepth: "standard",
    emotionalPacing: "simple",
    recoveryBehavior: "basic",

    // intelligence
    modelQuality: "standard",
    moodAwareness: "basic",
    personalityAdaptation: "basic",

    // memory
    memoryLevel: "basic",
    contextRetention: "short",

    // experience
    speedPriority: "standard",
    retryRepairPriority: "standard",
    queuePriority: "normal",

    // modes
    scheduledCheckins: false,
    stoicGroundingModes: "limited",

    // extras
    customization: "minimal",
    experimentalFeatures: false,
    voiceFeatures: false,
  },

  companion: {
    label: "Companion",
    price: 4.99,

    // limits
    dailyMessageLimit: 300,

    // behavior
    replyLength: "deeper",
    replyDepth: "enhanced",
    emotionalPacing: "human",
    recoveryBehavior: "natural",

    // intelligence
    modelQuality: "higher",
    moodAwareness: "adaptive",
    personalityAdaptation: "personalized",

    // memory
    memoryLevel: "enhanced",
    contextRetention: "continuous",

    // experience
    speedPriority: "priority",
    retryRepairPriority: "higher",
    queuePriority: "priority",

    // modes
    scheduledCheckins: true,
    stoicGroundingModes: "full",

    // extras
    customization: "expanded",
    experimentalFeatures: true,
    voiceFeatures: false,
  },

  presence: {
    label: "Presence",
    price: 9.99,

    // limits
    dailyMessageLimit: 800,

    // behavior
    replyLength: "deep",
    replyDepth: "immersive",
    emotionalPacing: "human",
    recoveryBehavior: "advanced",

    // intelligence
    modelQuality: "advanced",
    moodAwareness: "deep_adaptive",
    personalityAdaptation: "contextual",

    // memory
    memoryLevel: "advanced",
    contextRetention: "long",

    // experience
    speedPriority: "high_priority",
    retryRepairPriority: "advanced",
    queuePriority: "high",

    // modes
    scheduledCheckins: true,
    stoicGroundingModes: "full",

    // extras
    customization: "full",
    experimentalFeatures: true,
    voiceFeatures: true,
  },

  professionals: {
    label: "Professionals",
    price: 49.99,

    // limits
    dailyMessageLimit: 2000,

    // behavior
    replyLength: "strategic",
    replyDepth: "professional",
    emotionalPacing: "high_awareness",
    recoveryBehavior: "advanced",

    // intelligence
    modelQuality: "elite",
    moodAwareness: "executive",
    personalityAdaptation: "strategic",

    // memory
    memoryLevel: "professional",
    contextRetention: "extended",

    // experience
    speedPriority: "highest",
    retryRepairPriority: "elite",
    queuePriority: "highest",

    // modes
    scheduledCheckins: true,
    stoicGroundingModes: "full",

    // extras
    customization: "full",
    experimentalFeatures: true,
    voiceFeatures: true,
    strategicReflection: true,
  },

  elite: {
    label: "Elite",
    price: null,

    // future
    comingSoon: true,
  },
};

function getTalkioPlan(userPlan = "free") {
  return TALKIO_PLANS[userPlan] || TALKIO_PLANS.free;
}

module.exports = {
  TALKIO_PLANS,
  getTalkioPlan,
};