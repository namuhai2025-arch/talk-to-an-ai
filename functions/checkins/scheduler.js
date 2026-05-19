"use strict";

const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db } = require("../lib/firebase");
const { sendPushToUser } = require("../notifications/sendPush");

function logInfo(event, data = {}) {
  console.log(event, {
    timestamp: new Date().toISOString(),
    data,
  });
}

function logError(event, error, data = {}) {
  console.error(event, {
    timestamp: new Date().toISOString(),
    message: error?.message || String(error),
    stack: error?.stack || null,
    data,
  });
}

function getLocalDateKey(date, timeZone) {
  const local = new Date(date.toLocaleString("en-US", { timeZone }));
  const yyyy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getLocalNowParts(date, timeZone) {
  const local = new Date(date.toLocaleString("en-US", { timeZone }));
  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
    hour: local.getHours(),
    minute: local.getMinutes(),
    totalMinutes: local.getHours() * 60 + local.getMinutes(),
  };
}

function isWithinCheckinWindow(nowParts, targetHour, targetMinute, windowMinutes = 2) {
  const targetTotal = targetHour * 60 + targetMinute;
  return (
    nowParts.totalMinutes >= targetTotal &&
    nowParts.totalMinutes < targetTotal + windowMinutes
  );
}

function wasRecentlyActive(userDoc, minutes = 30) {
  const lastUserMessageAt = userDoc?.lastUserMessageAt?.toDate?.();
  if (!lastUserMessageAt) return false;

  const diffMs = Date.now() - lastUserMessageAt.getTime();
  return diffMs < minutes * 60 * 1000;
}

function pickCheckinMessage(checkin = {}, userData = {}) {
  const customMessage =
    typeof checkin?.message === "string" && checkin.message.trim()
      ? checkin.message.trim()
      : null;

  if (customMessage) return customMessage;

  const lastEmotion = userData?.lastEmotion || "";
  const lastOpenLoop = userData?.lastOpenLoop || "";

  if (lastOpenLoop) {
    return `Hey… I was thinking about what you shared earlier. Kumusta na 'yun ngayon?`;
  }

  if (lastEmotion === "sad" || lastEmotion === "low") {
    return `Hey… just checking in. Kumusta ka ngayon?`;
  }

  if (lastEmotion === "overwhelmed") {
    return `Hi… how are things feeling today? Medyo mabigat pa rin ba?`;
  }

  if (lastEmotion === "drained") {
    return `Hey… just wanted to check in. Nakapagpahinga ka ba kahit konti?`;
  }

  return `Hey… just checking in. How are you today?`;
}

const processDueCheckins = onSchedule(
  {
    schedule: "* * * * *",
    timeZone: "Asia/Manila",
  },
  async () => {
    try {
      logInfo("process_due_checkins_started");

      const now = new Date();
      const hourQueries = Array.from({ length: 24 }, (_, hour) =>
        db
          .collection("checkins")
          .where("enabled", "==", true)
          .where("localHour", "==", hour)
          .get()
      );

      const hourSnapshots = await Promise.all(hourQueries);
      const docs = hourSnapshots.flatMap((snap) => snap.docs);

      for (const doc of docs) {
        const checkin = doc.data();
        const uid = doc.id;
        const timeZone = checkin.timezone || "Asia/Manila";
        const localHour =
          typeof checkin.localHour === "number" ? checkin.localHour : 19;
        const localMinute =
          typeof checkin.localMinute === "number" ? checkin.localMinute : 0;

        const localDateKey = getLocalDateKey(now, timeZone);
        const localNow = getLocalNowParts(now, timeZone);

        if (localNow.hour !== localHour) continue;

        const isDue = isWithinCheckinWindow(localNow, localHour, localMinute, 2);
        if (!isDue) continue;

        if (checkin.lastSentDate === localDateKey) continue;

        const userSnap = await db.collection("users").doc(uid).get();
        const userData = userSnap.exists ? userSnap.data() : {};

        if (wasRecentlyActive(userData, 30)) continue;

        const message = pickCheckinMessage(checkin, userData);

        const deepLink = `https://talkiochat.com/chat?source=checkin&message=${encodeURIComponent(
          message
        )}`;

        const pushResult = await sendPushToUser(uid, {
          title: "Talkio",
          body: message,
          data: {
            type: "checkin",
            source: "talkio_checkin",
            checkinMessage: message,
            deepLink,
          },
        });

        if (pushResult?.successCount > 0) {
          await db.collection("checkins").doc(uid).set(
            {
              lastSentDate: localDateKey,
              lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
              lastCheckinMessage: message,
              sentCount: admin.firestore.FieldValue.increment(1),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      }

      logInfo("process_due_checkins_finished");
    } catch (error) {
      logError("process_due_checkins_failed", error);
    }
  }
);

module.exports = {
  processDueCheckins,
};