// functions/memory/maintenance.js

const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
  MONTHLY_DECAY,
  MAX_ACTIVE_MEMORY_ITEMS,
} = require("./config");
const {
  getDb,
  memoryMetaDoc,
  clamp,
} = require("./helpers");

const db = getDb();

function daysBetween(nowMs, pastMs) {
  return Math.max(0, (nowMs - pastMs) / (1000 * 60 * 60 * 24));
}

const decayMemoryScores = onSchedule("every 24 hours", async () => {
  const usersSnap = await db.collection("users").get();

  for (const user of usersSnap.docs) {
    const userId = user.id;
    const memorySnap = await db
      .collection("users")
      .doc(userId)
      .collection("memory")
      .where("status", "==", "active")
      .get();

    const batch = db.batch();
    const nowMs = Date.now();

    for (const doc of memorySnap.docs) {
      const data = doc.data() || {};
      if (data.tier === "core") continue;

      const lastUsed =
        data.lastUsedAt && typeof data.lastUsedAt.toDate === "function"
          ? data.lastUsedAt.toDate().getTime()
          : data.updatedAt && typeof data.updatedAt.toDate === "function"
          ? data.updatedAt.toDate().getTime()
          : nowMs;

      const decayPerDay = (MONTHLY_DECAY[data.tier] || 8) / 30;
      const unusedDays = daysBetween(nowMs, lastUsed);
      const newScore = clamp(Number(data.retentionScore || 0) - unusedDays * decayPerDay);

      const update = {
        retentionScore: Math.round(newScore),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (newScore <= 0) {
        update.status = "archived";
      }

      batch.set(doc.ref, update, { merge: true });
    }

    batch.set(
      memoryMetaDoc(userId),
      {
        lastDecayRunAt: admin.firestore.FieldValue.serverTimestamp(),
        version: 1,
      },
      { merge: true }
    );

    await batch.commit();
  }
});

const pruneMemory = onSchedule("every 24 hours", async () => {
  const usersSnap = await db.collection("users").get();

  for (const user of usersSnap.docs) {
    const userId = user.id;
    const activeSnap = await db
      .collection("users")
      .doc(userId)
      .collection("memory")
      .where("status", "==", "active")
      .get();

    const activeItems = activeSnap.docs.map((doc) => ({
      id: doc.id,
      ref: doc.ref,
      ...doc.data(),
    }));

    if (activeItems.length <= MAX_ACTIVE_MEMORY_ITEMS) continue;

    const pruneCandidates = activeItems
      .filter((m) => m.tier !== "core")
      .sort((a, b) => {
        if (a.tier !== b.tier) {
          if (a.tier === "light") return -1;
          if (b.tier === "light") return 1;
        }
        return Number(a.retentionScore || 0) - Number(b.retentionScore || 0);
      });

    const overflow = activeItems.length - MAX_ACTIVE_MEMORY_ITEMS;
    const toArchive = pruneCandidates.slice(0, overflow);

    const batch = db.batch();

    for (const item of toArchive) {
      batch.set(
        item.ref,
        {
          status: "archived",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    batch.set(
      memoryMetaDoc(userId),
      {
        lastPruneRunAt: admin.firestore.FieldValue.serverTimestamp(),
        version: 1,
      },
      { merge: true }
    );

    await batch.commit();
  }
});

module.exports = {
  decayMemoryScores,
  pruneMemory,
};