import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

const db = admin.firestore();

const LUNCH_MESSAGES = [
  "Hey… just checking in. How’s your day going so far?",
  "A little midday hello from me. How are you holding up today?",
  "Just dropping by for a quick check-in. How’s your afternoon treating you?",
  "Hope your day’s going okay. Want to tell me how it’s been?",
  "Midday pause. How are you feeling right now?",
  "Just here for a soft little check-in. How’s your day?",
  "How’s everything going so far today?",
  "A quick hello in the middle of the day. You doing alright?",
  "Just checking in for a moment. How’s your energy today?",
  "Hey, how’s the day feeling on your side?"
];

const AFTER_WORK_MESSAGES = [
  "Hey… you made it through the day. How are you feeling now?",
  "Just checking in tonight. How did today go for you?",
  "I’m here if you feel like unloading a little from the day.",
  "How was your day, really?",
  "You’re off the clock now, or close to it. How are you doing?",
  "Just a quiet check-in from me. How’s your evening going?",
  "Long day or manageable day?",
  "I’m around tonight if you feel like talking.",
  "How did the day leave you feeling?",
  "You made it to the evening. How’s your head and heart right now?"
];

function pickRandom(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getManilaMinutes(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  return hour * 60 + minute;
}

function getWindowType(date: Date): "lunch" | "after_work" | null {
  const totalMinutes = getManilaMinutes(date);

  const lunchStart = 12 * 60; // 12:00 PM
  const lunchEnd = 13 * 60 + 30; // 1:30 PM

  const afterWorkStart = 18 * 60; // 6:00 PM
  const afterWorkEnd = 20 * 60; // 8:00 PM

  if (totalMinutes >= lunchStart && totalMinutes <= lunchEnd) return "lunch";
  if (totalMinutes >= afterWorkStart && totalMinutes <= afterWorkEnd) return "after_work";

  return null;
}

function getManilaDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export const sendTalkioCheckIns = onSchedule(
  {
    schedule: "every 30 minutes",
    timeZone: "Asia/Manila",
    region: "asia-southeast1",
  },
  async () => {
    const now = new Date();
    const windowType = getWindowType(now);

    if (!windowType) {
      logger.info("Outside lunch/after-work window.");
      return;
    }

    const todayKey = getManilaDateKey(now);

    const usersSnap = await db
      .collection("users")
      .where("checkInEnabled", "==", true)
      .where("notificationsEnabled", "==", true)
      .get();

    logger.info(`Evaluating ${usersSnap.size} users for check-ins.`);

    for (const userDoc of usersSnap.docs) {
      try {
        const userData = userDoc.data();
        const userId = userDoc.id;

        const tokens: string[] = Array.isArray(userData.fcmTokens)
          ? userData.fcmTokens
          : [];

        if (!tokens.length) {
          logger.info(`Skip ${userId}: no FCM tokens.`);
          continue;
        }

        const presenceRef = db
          .collection("users")
          .doc(userId)
          .collection("presence")
          .doc("state");

        const presenceSnap = await presenceRef.get();

        if (!presenceSnap.exists) {
          logger.info(`Skip ${userId}: no presence doc.`);
          continue;
        }

        const presence = presenceSnap.data() || {};

        const lastUserMessageAt = presence.lastUserMessageAt?.toDate?.() as
          | Date
          | undefined;
        const lastCheckInSentAt = presence.lastCheckInSentAt?.toDate?.() as
          | Date
          | undefined;
        const activeSession = Boolean(presence.activeSession);

        if (!lastUserMessageAt) {
          logger.info(`Skip ${userId}: no lastUserMessageAt.`);
          continue;
        }

        if (activeSession) {
          logger.info(`Skip ${userId}: active session.`);
          continue;
        }

        const hoursSinceLastUserMessage =
          (now.getTime() - lastUserMessageAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceLastUserMessage < 2) {
          logger.info(`Skip ${userId}: user active within 2 hours.`);
          continue;
        }

        if (lastCheckInSentAt) {
          const lastCheckInKey = getManilaDateKey(lastCheckInSentAt);
          if (lastCheckInKey === todayKey) {
            logger.info(`Skip ${userId}: already sent a check-in today.`);
            continue;
          }
        }

        const body =
          windowType === "lunch"
            ? pickRandom(LUNCH_MESSAGES)
            : pickRandom(AFTER_WORK_MESSAGES);

        const message: admin.messaging.MulticastMessage = {
          tokens,
          notification: {
            title: "Talkio",
            body,
          },
          data: {
            type: "check_in",
            checkInType: windowType,
            body,
          },
        };

        const result = await admin.messaging().sendEachForMulticast(message);

        const invalidTokens: string[] = [];

        result.responses.forEach((resp, index) => {
          if (!resp.success) {
            const code = resp.error?.code || "";
            if (
              code.includes("invalid-registration-token") ||
              code.includes("registration-token-not-registered")
            ) {
              invalidTokens.push(tokens[index]);
            }
          }
        });

        await presenceRef.set(
          {
            lastCheckInSentAt: admin.firestore.FieldValue.serverTimestamp(),
            lastCheckInType: windowType,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        if (invalidTokens.length) {
          const cleanedTokens = tokens.filter((t) => !invalidTokens.includes(t));

          await userDoc.ref.set(
            {
              fcmTokens: cleanedTokens,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        logger.info(
          `Check-in sent to ${userId}. Success count: ${result.successCount}`
        );
      } catch (error) {
        logger.error(`Failed check-in for ${userDoc.id}`, error);
      }
    }
  }
);

export const clearInactiveSessions = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Asia/Manila",
    region: "asia-southeast1",
  },
  async () => {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);

    const snap = await db.collectionGroup("presence").get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const lastConversationAt = data.lastConversationAt?.toDate?.() as
        | Date
        | undefined;

      if (!lastConversationAt) continue;
      if (data.activeSession !== true) continue;

      if (lastConversationAt < cutoff) {
        await doc.ref.set(
          {
            activeSession: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  }
);