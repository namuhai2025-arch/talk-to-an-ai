"use strict";

const admin = require("firebase-admin");
const { db } = require("../lib/firebase");

async function recordSemanticShadowMetrics(result = {}) {

  // 1. Validate input

if (
  !result ||
  typeof result !== "object" ||
  Array.isArray(result)
) {
  return;
}

const hasMeasurement =
  typeof result.consulted === "boolean" ||
  typeof result.parsed === "boolean" ||
  typeof result.reason === "string" ||
  result.semanticSignals ||
  result.comparison;

if (!hasMeasurement) {
  return;
}


  // 2. Build Firestore update object

  const increment =
  admin.firestore.FieldValue.increment;

const updates = {
  semanticShadowRuns:
    increment(1),

  semanticConsulted:
    increment(
      result.consulted === true
        ? 1
        : 0
    ),

  semanticSkipped:
    increment(
      result.consulted === false
        ? 1
        : 0
    ),

  semanticParsed:
    increment(
      result.parsed === true
        ? 1
        : 0
    ),

  semanticParseFailed:
    increment(
      result.consulted === true &&
      result.parsed !== true
        ? 1
        : 0
    ),

  semanticAgreement:
    increment(
      result.comparison?.agrees === true
        ? 1
        : 0
    ),

  semanticDisagreement:
    increment(
      result.comparison?.agrees === false
        ? 1
        : 0
    ),

  updatedAt:
    admin.firestore.FieldValue
      .serverTimestamp(),
};

  const confidence =
  result.semanticSignals?.confidence;

if (
  typeof confidence === "number" &&
  Number.isFinite(confidence)
) {
  updates.semanticConfidenceTotal =
    increment(confidence);

  updates.semanticConfidenceSamples =
    increment(1);
}


  // 3. Write analytics

  const today =
  new Date()
    .toISOString()
    .slice(0, 10);

await db
  .collection("analytics")
  .doc(today)
  .set(
    updates,
    { merge: true }
  );


}

module.exports = {
  recordSemanticShadowMetrics,
};