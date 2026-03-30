// functions/reminders/scheduler.js

const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const { getDueReminders, markReminderSent } = require("./helpers");
const { sendPushToUser } = require("./fcm");
const { getRelevantMemory } = require("../memory_lite/retrieval");
const { buildReminderMessage } = require("./messageBuilder");
const { upsertMemory } = require("../memory_lite/helpers");
const { MEMORY_TYPES, MEMORY_SOURCES, MEMORY_TIERS } = require("../memory_lite/types");

const processDueReminders = onSchedule("every 1 minutes", async () => {
  const due = await getDueReminders(200);

  for (const reminder of due) {
    try {
      logger.info("Reminder due", {
        userId: reminder.userId,
        reminderId: reminder.id,
        text: reminder.text,
      });

      const memoryItems = await getRelevantMemory(reminder.userId, reminder.text, 5);
const message = buildReminderMessage(reminder, memoryItems);

await sendPushToUser(
  reminder.userId,
  message.title,
  message.body
);

await markReminderSent(reminder.ref);

await upsertMemory(reminder.userId, {
  type: MEMORY_TYPES.REMINDER_FOLLOWUP,
  key: `followup_${reminder.id}`,
  value: `User had a reminder to ${reminder.text}`,
  source: MEMORY_SOURCES.SYSTEM_SUMMARY,
  tier: MEMORY_TIERS.IMPORTANT,
  confidence: 0.9,
  importance: 0.85,
  tags: ["followup", "reminder", reminder.category || "general"],
});

    } catch (error) {
      logger.error("Failed processing reminder", {
        userId: reminder.userId,
        reminderId: reminder.id,
        error: error?.message || String(error),
      });
    }
  }
});

module.exports = {
  processDueReminders,
};