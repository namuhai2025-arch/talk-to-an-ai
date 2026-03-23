// functions/memory/types.js

const MEMORY_TYPES = {
  PROFILE: "profile",
  PREFERENCE: "preference",
  GOAL: "goal",
  ROUTINE: "routine",
  REMINDERS_META: "reminders_meta",
  CONVERSATION_SUMMARY: "conversation_summary",
  PERSON: "person",
};

const MEMORY_SOURCES = {
  USER_EXPLICIT: "user_explicit",
  ASSISTANT_INFERRED: "assistant_inferred",
  SYSTEM_SUMMARY: "system_summary",
};

const MEMORY_TIERS = {
  CORE: "core",
  IMPORTANT: "important",
  LIGHT: "light",
};

const MEMORY_STATUS = {
  ACTIVE: "active",
  ARCHIVED: "archived",
  DELETED: "deleted",
};

module.exports = {
  MEMORY_TYPES,
  MEMORY_SOURCES,
  MEMORY_TIERS,
  MEMORY_STATUS,
};