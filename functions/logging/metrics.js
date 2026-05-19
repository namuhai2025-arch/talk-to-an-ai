"use strict";

const admin = require("firebase-admin");
const { db } = require("../lib/firebase");

async function incrementMetric(metricName, amount = 1) {
  const today = new Date().toISOString().slice(0, 10);

  await db
    .collection("analytics")
    .doc(today)
    .set(
      {
        [metricName]: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function logResponseMode(mode) {
  if (!mode) return;

  await incrementMetric(`responseMode_${mode}`, 1);
}

async function logFallback(path) {
  if (!path) return;

  await incrementMetric(`fallback_${path}`, 1);
}

async function logLatency(ms) {
  if (typeof ms !== "number") return;

  const today = new Date().toISOString().slice(0, 10);

  await db
    .collection("analytics")
    .doc(today)
    .set(
      {
        totalLatencyMs: admin.firestore.FieldValue.increment(ms),
        latencySamples: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function logDailyUser(uid) {
  if (!uid) return;

  const today = new Date().toISOString().slice(0, 10);

  await db
    .collection("analytics_users")
    .doc(`${today}_${uid}`)
    .set(
      {
        uid,
        day: today,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

function logPipelineResult(data = {}) {
  console.log("TALKIO_METRIC", {
    event: "pipeline_result",
    ...data,
    timestamp: new Date().toISOString(),
  });
}

function logModelFailure(data = {}) {
  console.error("TALKIO_METRIC", {
    event: "model_failure",
    ...data,
    timestamp: new Date().toISOString(),
  });
}

function logRateLimitHit(data = {}) {
  console.warn("TALKIO_METRIC", {
    event: "rate_limit_hit",
    ...data,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  incrementMetric,
  logResponseMode,
  logFallback,
  logLatency,
  logDailyUser,
  logPipelineResult,
  logModelFailure,
  logRateLimitHit,
};