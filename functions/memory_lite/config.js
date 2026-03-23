// functions/memory/config.js

const STARTING_SCORE = {
  core: 100,
  important: 75,
  light: 40,
};

const MONTHLY_DECAY = {
  core: 1,
  important: 3,
  light: 8,
};

const REINFORCEMENT_BOOST = {
  explicit_repeat: 15,
  indirect_repeat: 8,
  successful_use: 5,
};

const MAX_ACTIVE_MEMORY_ITEMS = 50;
const MAX_RETRIEVED_MEMORY_ITEMS = 5;
const MAX_SUMMARY_CHARS = 800;

module.exports = {
  STARTING_SCORE,
  MONTHLY_DECAY,
  REINFORCEMENT_BOOST,
  MAX_ACTIVE_MEMORY_ITEMS,
  MAX_RETRIEVED_MEMORY_ITEMS,
  MAX_SUMMARY_CHARS,
};