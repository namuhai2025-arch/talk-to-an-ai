const admin = require("firebase-admin");

const db = admin.firestore();

async function markUserMessage(userId) {
  const userRef = db.collection("users").doc(userId);

  // 🔥 Ensure parent doc exists
  await userRef.set(
    {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const ref = userRef.collection("presence").doc("state");

  await ref.set(
    {
      lastUserMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastConversationAt: admin.firestore.FieldValue.serverTimestamp(),
      activeSession: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function markTalkioReply(userId) {
  const userRef = db.collection("users").doc(userId);

  // 🔥 Ensure parent doc exists
  await userRef.set(
    {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const ref = userRef.collection("presence").doc("state");

  await ref.set(
    {
      lastTalkioReplyAt: admin.firestore.FieldValue.serverTimestamp(),
      lastConversationAt: admin.firestore.FieldValue.serverTimestamp(),
      activeSession: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

module.exports = {
  markUserMessage,
  markTalkioReply,
};