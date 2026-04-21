"use strict";

const DISTRESS_PATTERNS = {
  crisis:
    /\b(kill myself|killing myself|end my life|take my life|i want to die|i wanna die|i don't want to live|i dont want to live|i will (?:kill|hurt|harm) myself|self[-\s]?harm|suicid(?:e|al)|overdose)\b/i,

  distress:
    /\b(devastated|broken|shattered|heartbroken|betrayed|cheated|hurt badly|hurting badly|lost everything|crushed)\b/i,

  overwhelm:
    /\b(overwhelmed|panic|panicking|can't think|cant think|don't know what to do|dont know what to do|falling apart|spiraling|spiralling)\b/i,

  numbness:
    /\b(empty|numb|nothing matters|don’t feel anything|dont feel anything|checked out|dead inside)\b/i,

  suppression:
    /\b(i guess|whatever|fine i guess|it's fine|its fine|okay i guess|doesn't matter|doesnt matter|it is what it is)\b/i,

  agitation:
    /\b(angry|mad|furious|pissed|annoyed|fed up)\b/i,

  intoxication:
    /\b(drunk|tipsy|wasted|intoxicated|hammered|not sober|high|drinking again|drunk as hell)\b/i,

  indirectCoping:
    /\b(at the bar|been drinking|trying not to think|trying to forget|just want to disappear for a while)\b/i,

  fragileRecovery:
    /\b(i'm okay now|im okay now|i'm fine now|im fine now|all good now|better now)\b/i,

  identityCollapse:
    /\b(i am nobody|i'm nobody|i am nothing|i'm nothing|worthless|useless|empty)\b/i,

  abandonment:
    /\b(alone|ignored|everyone leaves|no one cares|nobody cares|left me)\b/i,

  disoriented:
    /\b(i don't know where to go|i dont know where to go|don't know what to do|dont know what to do|lost|nowhere to go|i am nobody|i'm nobody|nothing matters)\b/i,
};

const TRAJECTORY_PATTERNS = {
  lighterSurface:
    /\b(i'm okay|im okay|i'm fine|im fine|all good|haha|lol|lmao|just chilling|whatever|it's fine|its fine)\b/i,

  shutdown:
    /\b(doesn't matter|doesnt matter|never mind|forget it|leave it|whatever)\b/i,

  repeatedLoop:
    /\b(still|again|same|nothing changed|always|every time)\b/i,

  strongDistress:
    /\b(devastated|broken|shattered|heartbroken|betrayed|lost|empty|numb|worthless|alone|ignored|overwhelmed|falling apart|spiraling|panic|drunk|nobody cares|i am nobody|i'm nobody)\b/i,
};

const REPLY_PATTERNS = {
  unsafePlayful:
    /\b(haha|lol|lmao|sounds like a night|having fun|good time|party|celebrating|enjoying|glad you're having)\b/i,

  metaLeak:
    /\b(human companion|pre-programmed|system prompt|as an ai)\b/i,

  genericWeak:
    /\b(i see\.?$|okay then\.?$|alright\.?$)\b/i,

  blockedMinimal: [
    /^i['’]?m here\.?\s*go on\.?$/i,
    /^something went wrong/i,
    /^\.\.\.$/,
  ],

  repetitiveEmpathy:
    /\b(that sounds|that's a lot|that's heavy|that sounds heavy|that sounds like|that's rough)\b/i,

  redundantQuestion:
    /\b(what('?s| is)\s+(making|causing)|what\s+caused|why\s+do\s+you\s+feel|tell\s+me\s+(a\s+bit\s+)?more\s+about|can\s+you\s+tell\s+me\s+(a\s+bit\s+)?more|what('?s| is)\s+going\s+on|what('?s| is)\s+happening)\b/i,

  depthSignal:
    /\b(because|underneath|sounds like|that part|what('?s|’s) really|what you('?re|’re) trying to|less like|more like|with everything|given that|at this point|right now)\b/i,

  groundedObservation:
    /\b(this does(n't|n’t) sound|that sounds less like|that sounds more like|it seems like|it feels like|what('?s|’s) hitting you|what('?s|’s) really hard|the part that)\b/i,

  actionableGrounding:
    /\b(one small thing|next step|right now|for now|stay with|keep it simple|do(n't|n’t) try to|just focus on|first|slow it down|steady yourself)\b/i,

  identityStabilization:
    /\b(not\s+the\s+whole\s+truth|not\s+your\s+whole\s+identity|this\s+moment\s+isn'?t\s+your\s+whole\s+identity|it\s+can\s+feel\s+completely\s+true|let'?s\s+not\s+turn\s+this\s+moment\s+into\s+your\s+whole\s+identity|that\s+thought\s+is\s+hitting\s+hard|your\s+mind\s+is\s+turning\s+pain\s+into\s+identity)\b/i,

  floatyForGround:
    /\b(adrift|fog|drift|storm|darkness|void|unraveling|crumbling)\b/i,

  spokenTexture:
    /\b(yeah|hmm|ah|okay|wait|right|fair|honestly|really)\b/i,

  overlyPolished:
    /\b(I understand how you feel|that sounds very difficult|thank you for sharing|your feelings are valid|how does that make you feel)\b/i,

  abstract:
    /\b(journey|process|healing takes time|growth|moving forward|navigate this)\b/i,

  immediateAnchor:
    /\b(right\s+now|for\s+now|let'?s\s+slow\s+it\s+down|one\s+thing|one\s+step|stay\s+with|keep\s+it\s+simple|just\s+focus\s+on|this\s+moment)\b/i,

  stabilizeProbingQuestion:
    /\b(tell me more|what's making you|what caused this|can you tell me more)\b/i,

  groundOrStabilizeProbingQuestion:
    /\b(tell me more|what caused this|why do you feel)\b/i,

  groundProbingQuestion:
    /\b(tell me more|can you tell me more|what's been making you|what caused this)\b/i,
};

function hasGroundModeShape(text) {
  const normalized = String(text || "").trim();

  const sentenceCount = (normalized.match(/[.!?]+/g) || []).length || 1;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  return sentenceCount <= 4 && wordCount <= 70;
}

module.exports = {
  DISTRESS_PATTERNS,
  TRAJECTORY_PATTERNS,
  REPLY_PATTERNS,
};