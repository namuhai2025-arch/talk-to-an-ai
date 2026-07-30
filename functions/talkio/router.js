/*
|--------------------------------------------------------------------------
| Capability Router
|--------------------------------------------------------------------------
|
| Detects which optional prompt capabilities are relevant.
| It does not build prompts or call the model.
|
*/

function detectCapabilities({
  userMessage = "",
  conversation = [],
  memory = {},
} = {}) {
  const text =
    typeof userMessage === "string"
      ? userMessage
          .trim()
          .toLowerCase()
      : "";

  const recentConversation =
    Array.isArray(conversation)
      ? conversation
      : [];

  const capabilities = [
  "coreIdentity",
  "talkioSoul",
  "humanRealism",
];

const trustSafeMode =
  needsTrustSafeMode(text);

if (
  needsReasoning(text) &&
  !trustSafeMode
) {
  capabilities.push("reasoning");
}

if (
  needsObservation(
    text,
    recentConversation,
    memory
  )
) {
  capabilities.push("observation");
}

if (
  needsRelationalIntelligence(
    recentConversation,
    memory
  )
) {
  capabilities.push(
    "relationalIntelligence"
  );
}

if (
  needsJudgment(text) &&
  !trustSafeMode
) {
  capabilities.push("judgment");
}

if (
  needsWisdom(
    text,
    recentConversation
  )
) {
  capabilities.push("wisdom");
}

if (needsNervousSystem(text)) {
  capabilities.push("nervousSystem");
}

if (trustSafeMode) {
  capabilities.push("trustSafe");
}

  return [...new Set(capabilities)];
}

function needsTrustSafeMode(text) {
  return (
    /\bwhy should i trust you\b/.test(text) ||
    /\bcan i trust you\b/.test(text) ||
    /\bis this private\b/.test(text) ||
    /\bis this confidential\b/.test(text) ||
    /\bwho can see this\b/.test(text) ||
    /\bdo you store\b/.test(text) ||
    /\bdo you collect\b/.test(text) ||
    /\buse this against me\b/.test(text) ||
    /\bare you safe\b/.test(text)
  );
}

function needsReasoning(text) {
  return (
    needsJudgment(text) ||
    /\bwhy (did|does|do|is|are|would|could|has|have)\b/.test(text) ||
    /\bwhat (does|did|could|would) this mean\b/.test(text) ||
    /\bhelp me understand\b/.test(text) ||
    /\bdoes this make sense\b/.test(text) ||
    /\bwhat changed\b/.test(text)
  );
}

function needsJudgment(text) {
  return (
    /\bwhat should i do\b/.test(text) ||
    /\bshould i\b/.test(text) ||
    /\bwould you\b/.test(text) ||
    /\bif you were me\b/.test(text) ||
    /\bwhat would you do\b/.test(text) ||
    /\bhelp me decide\b/.test(text) ||
    /\bwhich (one|option|choice|path)\b/.test(text) ||
    /\bis this a mistake\b/.test(text) ||
    /\bam i thinking about this correctly\b/.test(text)
  );
}

function needsRelationalIntelligence(
  conversation,
  memory
) {
  const hasConversationHistory =
    Array.isArray(conversation) &&
    conversation.length > 0;

  const hasContinuityMemory =
    memory &&
    typeof memory === "object" &&
    Object.keys(memory).length > 0;

  return (
    hasConversationHistory ||
    hasContinuityMemory
  );
}

function needsObservation(text, conversation, memory) {
  const hasEnoughConversation = conversation.length >= 4;

  const asksAboutPattern =
    /\bpattern\b/.test(text) ||
    /\bkeep doing this\b/.test(text) ||
    /\bwhy do i always\b/.test(text) ||
    /\bthis keeps happening\b/.test(text) ||
    /\bwhat do you notice\b/.test(text);

  const hasMemorySignals =
    memory &&
    typeof memory === "object" &&
    Object.keys(memory).length > 0;

  return hasEnoughConversation || asksAboutPattern || hasMemorySignals;
}

function needsWisdom(text, conversation) {
  const hasEnoughConversation = conversation.length >= 3;

  const asksForPerspective =
    /\bwhat do you think\b/.test(text) ||
    /\bhelp me understand\b/.test(text) ||
    /\bwhy does this keep happening\b/.test(text) ||
    /\bwhat am i missing\b/.test(text);

  return hasEnoughConversation || asksForPerspective;
}

function needsNervousSystem(text) {
  return (
    /\banxious\b/.test(text) ||
    /\banxiety\b/.test(text) ||
    /\bpanic\b/.test(text) ||
    /\bpanicking\b/.test(text) ||
    /\boverwhelmed\b/.test(text) ||
    /\bemotionally flooded\b/.test(text) ||
    /\bspiraling\b/.test(text) ||
    /\bcan't calm down\b/.test(text) ||
    /\bcannot calm down\b/.test(text) ||
    /\bcan't settle\b/.test(text) ||
    /\bheart is racing\b/.test(text) ||
    /\bchest feels tight\b/.test(text) ||
    /\bphysically tense\b/.test(text)
  );
}

module.exports = {
  detectCapabilities,
};