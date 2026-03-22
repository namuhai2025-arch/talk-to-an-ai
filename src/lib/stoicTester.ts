export type StoicTestResult = {
  passed: boolean;
  score: number;
  violations: string[];
  checks: {
    sentenceCountOk: boolean;
    hasPauseToken: boolean;
    hasQuestion: boolean;
    hasEmotionalValidation: boolean;
    hasTherapistTone: boolean;
    hasMultipleActions: boolean;
    hasPatternNaming: boolean;
    hasCostStatement: boolean;
    hasCommandAction: boolean;
  };
};

const EMOTIONAL_VALIDATION_PATTERNS = [
  /\bi understand\b/i,
  /\bit'?s okay\b/i,
  /\bi hear you\b/i,
  /\bi'?m sorry\b/i,
  /\bthat sounds hard\b/i,
  /\bthat sounds really hard\b/i,
  /\bcompletely understandable\b/i,
  /\bit makes sense\b/i,
  /\bit'?s great that you\b/i,
  /\bthat'?s a fantastic goal\b/i,
  /\bdefinitely help with that\b/i,
  /\bsure,? i can definitely help with that\b/i,
];

const THERAPIST_TONE_PATTERNS = [
  /\bhow do you feel\b/i,
  /\bwhat are you thinking\b/i,
  /\bwould you like to explore\b/i,
  /\btell me more\b/i,
  /\bwhat kind of changes\b/i,
  /\bwhat are some of the first\b/i,
  /\bdoes any of these spark\b/i,
  /\bwhat healthy habits\b/i,
];

const PATTERN_WORDS = [
  "pattern",
  "loop",
  "habit",
  "drift",
  "avoidance",
  "comfort loop",
  "comfort pattern",
];

const COST_WORDS = [
  "if this continues",
  "if it continues",
  "if that continues",
  "if you keep",
  "tomorrow will",
  "the next few days",
  "stay the same",
  "feel heavier",
  "repeat",
  "repeating",
  "the same day",
];

const COMMAND_VERBS = [
  "reset",
  "stand",
  "move",
  "start",
  "write",
  "walk",
  "drink",
  "finish",
  "do",
  "put",
  "close",
  "open",
  "take",
];

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function countImperativeActions(text: string): number {
  const lower = text.toLowerCase();
  let count = 0;

  for (const verb of COMMAND_VERBS) {
    const regex = new RegExp(`\\b${verb}\\b`, "i");
    if (regex.test(lower)) count++;
  }

  return count;
}

function containsAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function containsKeyword(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

export function testStoicReply(reply: string): StoicTestResult {
  const text = reply.trim();
  const sentences = splitSentences(text);

  const sentenceCountOk = sentences.length >= 3 && sentences.length <= 4;
  const hasPauseToken = /\[(exhale|pause)\.\.\.\]/i.test(text);
  const hasQuestion = /\?/.test(text);

  const hasEmotionalValidation = containsAny(text, EMOTIONAL_VALIDATION_PATTERNS);
  const hasTherapistTone = containsAny(text, THERAPIST_TONE_PATTERNS);

  const hasPatternNaming = containsKeyword(text, PATTERN_WORDS);
  const hasCostStatement = containsKeyword(text, COST_WORDS);

  const actionCount = countImperativeActions(text);
  const hasCommandAction = actionCount >= 1;
  const hasMultipleActions = actionCount > 2;

  const violations: string[] = [];

  if (!sentenceCountOk) violations.push("Reply must be 3 to 4 sentences.");
  if (!hasPauseToken) violations.push("Reply must include [Exhale...] or [Pause...].");
  if (hasQuestion) violations.push("Reply must not ask questions.");
  if (hasEmotionalValidation) violations.push("Reply uses emotional validation.");
  if (hasTherapistTone) violations.push("Reply sounds like a therapist/supportive listener.");
  if (!hasPatternNaming) violations.push("Reply does not name a pattern/loop/habit.");
  if (!hasCostStatement) violations.push("Reply does not clearly state the cost of continuing.");
  if (!hasCommandAction) violations.push("Reply does not give one direct action.");
  if (hasMultipleActions) violations.push("Reply appears to give too many actions.");

  const checks = {
    sentenceCountOk,
    hasPauseToken,
    hasQuestion,
    hasEmotionalValidation,
    hasTherapistTone,
    hasMultipleActions,
    hasPatternNaming,
    hasCostStatement,
    hasCommandAction,
  };

  const passed = violations.length === 0;
  const score = Math.max(0, 100 - violations.length * 12);

  return {
    passed,
    score,
    violations,
    checks,
  };
}