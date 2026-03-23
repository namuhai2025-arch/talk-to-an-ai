// functions/memory_lite/update.js

const admin = require("firebase-admin");
const { memoryCollection, upsertMemory } = require("./helpers");

const SINGLE_SLOT_RELATIONSHIPS = [
  "girlfriend",
  "boyfriend",
  "wife",
  "husband",
  "partner",
  "mother",
  "father",
  "mom",
  "dad",
  "boss",
  "manager",
  "roommate",
];

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function relationshipGroup(relationship) {
  const r = normalize(relationship);

  if (["girlfriend", "boyfriend", "wife", "husband", "partner"].includes(r)) {
    return "partner";
  }

  if (["mother", "father", "mom", "dad", "daughter", "son"].includes(r)) {
    return "immediate_family";
  }

  if (
    [
      "sister",
      "brother",
      "aunt",
      "uncle",
      "cousin",
      "grandma",
      "grandpa",
      "grandmother",
      "grandfather",
      "niece",
      "nephew",
    ].includes(r)
  ) {
    return "extended_family";
  }

  if (["friend", "best friend"].includes(r)) {
    return "friend";
  }

  if (["coworker", "colleague", "boss", "manager"].includes(r)) {
    return "work";
  }

  if (["neighbor", "roommate"].includes(r)) {
    return "home";
  }

  if (["teammate", "classmate"].includes(r)) {
    return "peer";
  }

  return r;
}

function extractRelationshipFromValue(value) {
  const text = String(value || "").toLowerCase();

  const match = text.match(
    /is the user's\s+(girlfriend|boyfriend|wife|husband|partner|mother|father|mom|dad|daughter|son|sister|brother|aunt|uncle|cousin|grandma|grandpa|grandmother|grandfather|niece|nephew|best friend|friend|neighbor|roommate|coworker|colleague|boss|manager|teammate|classmate)\b/
  );

  return match ? match[1] : "";
}

async function archiveConflictingPersonMemories(userId, candidate) {
  if (candidate.type !== "person") return { archived: 0 };

  const candidateRelationship = extractRelationshipFromValue(candidate.value);
  if (!candidateRelationship) return { archived: 0 };

  const candidateGroup = relationshipGroup(candidateRelationship);

  const snap = await memoryCollection(userId)
    .where("status", "==", "active")
    .where("type", "==", "person")
    .get();

  const batch = admin.firestore().batch();
  let archived = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};

    if (data.key === candidate.key) {
      continue;
    }

    const existingRelationship = extractRelationshipFromValue(data.value);
    const existingGroup = relationshipGroup(existingRelationship);

    const sameConflictGroup =
  existingRelationship === candidateRelationship ||
  (
    SINGLE_SLOT_RELATIONSHIPS.includes(candidateRelationship) &&
    existingGroup === candidateGroup
  );

    if (!sameConflictGroup) continue;

    batch.set(
      doc.ref,
      {
        status: "archived",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    archived += 1;
  }

  if (archived > 0) {
    await batch.commit();
  }

  return { archived };
}

async function upsertMemoryWithReplacement(userId, candidate) {
  if (candidate.type === "person") {
    await archiveConflictingPersonMemories(userId, candidate);
  }

  return upsertMemory(userId, candidate);
}

module.exports = {
  relationshipGroup,
  extractRelationshipFromValue,
  archiveConflictingPersonMemories,
  upsertMemoryWithReplacement,
};