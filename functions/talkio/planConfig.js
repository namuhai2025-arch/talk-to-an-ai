"use strict";

const TALKIO_PLANS = {
  free: {
    label: "Free",
    price: 0,

    // limits
    dailyMessageLimit: 10,

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
    scheduledCheckins: "basic",
    stoicGroundingModes: "limited",

    // extras
    customization: "minimal",
    experimentalFeatures: false,
    voiceFeatures: false,
  },

  pro: {
    label: "Talkio Pro",
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
    scheduledCheckins: "smart",
    stoicGroundingModes: "full",

    // extras
    customization: "expanded",
    experimentalFeatures: true,
    voiceFeatures: "planned",
  },
};

function getTalkioPlan(userPlan = "free") {
  return TALKIO_PLANS[userPlan] || TALKIO_PLANS.free;
}

module.exports = {
  TALKIO_PLANS,
  getTalkioPlan,
};