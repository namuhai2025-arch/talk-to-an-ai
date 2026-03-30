// functions/reminders/helpers.js

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

function getDb() {
  return admin.firestore();
}

function remindersCollection(userId) {
  return getDb().collection("users").doc(userId).collection("reminders");
}

async function createReminder(userId, reminder) {
  const now = admin.firestore.FieldValue.serverTimestamp();

  const doc = {
  text: reminder.text,
  category: reminder.category || "general",
  scheduledAt: reminder.scheduledAt,
  timezone: reminder.timezone || "Asia/Manila",
  status: "pending",
  repeat: reminder.repeat || "none",
  createdAt: now,
  updatedAt: now,
  sentAt: null,
  sourceMessage: reminder.sourceMessage || "",
};

  const ref = await remindersCollection(userId).add(doc);
  return { id: ref.id, ...doc };
}

async function getDueReminders(limit = 100) {
  const now = admin.firestore.Timestamp.now();
  const db = getDb();

  const usersSnap = await db.collection("users").get();
  const due = [];

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;

    const snap = await remindersCollection(userId)
      .where("status", "==", "pending")
      .where("scheduledAt", "<=", now)
      .limit(limit)
      .get();

    for (const doc of snap.docs) {
      due.push({
        userId,
        id: doc.id,
        ref: doc.ref,
        ...doc.data(),
      });
    }
  }

  return due;
}

async function markReminderSent(reminderRef) {
  await reminderRef.set(
    {
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

module.exports = {
  getDb,
  remindersCollection,
  createReminder,
  getDueReminders,
  markReminderSent,
};