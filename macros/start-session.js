// Intrinsic's Session Starter - Start Session Macro
// Triggers the 4-step session startup workflow:
// 1. Ready Check - Players mark themselves as ready
// 2. Housekeeping Journal - Opens journal for all players
// 3. Recap Voting - Players volunteer to recap, GM selects
// 4. Time Unpause - Unpause and resume time via Simple Timekeeping

if (!game.user.isGM) {
  ui.notifications.error("Only the GM can start a session!");
  return;
}

const api = game.modules.get("intrinsics-session-starter")?.api;

if (!api) {
  ui.notifications.error("Intrinsic's Session Starter module not loaded!");
  return;
}

// Start the session workflow
api.startSession();
