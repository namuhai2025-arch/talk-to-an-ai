// minimalGuard.js (can replace patterns.js)

const BLOCKED = [
  /something went wrong/i,
  /^i['’]?m here\.?$/i,
  /^\.{3,}$/,
];

const META_LEAK = /\b(system prompt|as an ai|pre-trained|language model)\b/i;

function isBadReply(text = "") {
  if (!text || text.length < 5) return true;

  if (META_LEAK.test(text)) return true;

  for (const pattern of BLOCKED) {
    if (pattern.test(text)) return true;
  }

  return false;
}

module.exports = { isBadReply };