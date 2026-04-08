module.exports = {
  scoreReply,
  repairReply,
  buildFallbackReply,
  generateTalkioReply,
  DEFAULT_THRESHOLDS,
  detectUserStateHybrid,
  classifyUserStateWithModel,
  scoreHeuristicConfidence,
  detectLikelyNonEnglish,
};

exports.bootstrapTalkioMemory = onRequest(...);
exports.saveTalkioProfile = onRequest(...);
exports.createCheckin = onRequest(...);
exports.processDueCheckins = onSchedule(...);
exports.generateTalkioReply = onRequest(...);
exports.testPush = onRequest(...);
exports.processSmartCheckins = onSchedule(...);
exports.decayMemoryScores = decayMemoryScores;
exports.pruneMemory = pruneMemory;
exports.processDueReminders = processDueReminders;