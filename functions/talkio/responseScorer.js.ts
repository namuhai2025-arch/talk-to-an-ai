function scoreReply({
  reply,
  latestUserMessage,
  previousAssistantReply = "",
  turnIndex = 0,
  userStateOverride = null,
}) {