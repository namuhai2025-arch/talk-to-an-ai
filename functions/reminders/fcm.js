const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

function getDb() {
  return admin.firestore();
}

async function getUserTokens(userId) {
  const snap = await getDb()
    .collection("users")
    .doc(userId)
    .collection("device_tokens")
    .get();

  return snap.docs
    .map((d) => d.data()?.token)
    .filter(Boolean);
}

async function sendPushToUser(userId, title, body) {
  const tokens = await getUserTokens(userId);

  if (!tokens.length) {
    console.log("FCM: no tokens for user", userId);
    return { successCount: 0, failureCount: 0, reason: "no_tokens" };
  }

  const message = {
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      title: String(title || "Talkio"),
      body: String(body || "You have a reminder"),
      type: "reminder",
    },
    android: {
      priority: "high",
      notification: {
        channelId: "talkio_reminders",
        sound: "default",
        priority: "high",
        defaultSound: true,
        defaultVibrateTimings: true,
        visibility: "public",
      },
    },
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  console.log("FCM response", {
    userId,
    successCount: response.successCount,
    failureCount: response.failureCount,
    responses: response.responses.map((r) => ({
      success: r.success,
      error: r.error ? r.error.message : null,
    })),
  });

  return response;
}

module.exports = {
  sendPushToUser,
};