"use strict";

function detectLanguageEnvironment(text = "") {
  const raw = String(text || "");
  const lower = raw.toLowerCase();

  const hasJapanese = /[ぁ-んァ-ン一-龯]/.test(raw);

  const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(raw);

  const hasChinese = /[\u4E00-\u9FFF]/.test(raw);

  const hasArabic = /[\u0600-\u06FF]/.test(raw);

  const hasHindi = /[\u0900-\u097F]/.test(raw);

  const hasRussian = /[а-яА-ЯЁё]/.test(raw);

  const hasSpanish =
    /(qué|porque|estoy|siento|vacío|triste|cansado|nadie)/i.test(lower);

  const hasFrench =
    /(je|suis|fatigué|triste|vide|personne|pourquoi)/i.test(lower);

  const hasGerman =
    /(ich|fühle|traurig|müde|warum|niemand)/i.test(lower);

  const hasPortuguese =
    /(estou|cansado|triste|ninguém|porque)/i.test(lower);

  const hasFilipino =
    /(pero|parang|naman|kaayo|gani|jud|murag|gikapoy|kapoy)/i.test(
      lower
    );

  const hasEnglish =
    /(the|and|but|feel|tired|sad|empty|why|nothing)/i.test(lower);

  const detected = [];

  if (hasJapanese) detected.push("japanese");
  if (hasKorean) detected.push("korean");
  if (hasChinese) detected.push("chinese");
  if (hasArabic) detected.push("arabic");
  if (hasHindi) detected.push("hindi");
  if (hasRussian) detected.push("russian");
  if (hasSpanish) detected.push("spanish");
  if (hasFrench) detected.push("french");
  if (hasGerman) detected.push("german");
  if (hasPortuguese) detected.push("portuguese");
  if (hasFilipino) detected.push("filipino");
  if (hasEnglish) detected.push("english");

  const unique = [...new Set(detected)];

  const primaryLanguage = unique[0] || "english";

  const mixed = unique.length > 1;

  let conversationalStyle = "neutral";

  if (raw.length < 25) {
    conversationalStyle = "short";
  }

  if (/haha|lol|lmao|😭|🥲|😂/i.test(raw)) {
    conversationalStyle = "casual";
  }

  if (/\.\.\./.test(raw)) {
    conversationalStyle = "soft";
  }

  return {
    primaryLanguage,
    detectedLanguages: unique,
    mixed,
    conversationalStyle,
    originalText: raw,
  };
}

module.exports = {
  detectLanguageEnvironment,
};