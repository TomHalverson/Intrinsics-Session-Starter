// Socket Handler - Centralized socket communication
const MODULE_ID = "intrinsics-session-starter";

// Initialize socket listener
export function initializeSocket() {
  if (!game.socket) {
    console.error(`${MODULE_ID} | Socket not available`);
    return;
  }

  game.socket.on(`module.${MODULE_ID}`, (data) => {
    handleSocketMessage(data);
  });

  console.log(`${MODULE_ID} | Socket listener initialized`);
}

// Handle incoming socket messages
function handleSocketMessage(data) {
  console.log(`${MODULE_ID} | Received socket message:`, data);

  switch(data.action) {
    case "syncState":
      onSyncState(data.state);
      break;
    case "playerReady":
      onPlayerReady(data.userId, data.ready);
      break;
    case "volunteerRecap":
      onVolunteerRecap(data.userId, data.volunteering);
      break;
    case "showJournal":
      onShowJournal(data.journalId, data.pageId);
      break;
    case "breakStart":
      onBreakStart(data.endTime, data.duration);
      break;
    case "breakEnd":
      onBreakEnd();
      break;
    default:
      console.warn(`${MODULE_ID} | Unknown socket action: ${data.action}`);
  }
}

// Handler: Sync state from GM
function onSyncState(state) {
  if (game.user.isGM) return; // GM already has the state

  const sessionManager = game.sessionManager;
  if (sessionManager) {
    sessionManager.updateStateFromGM(state);
  }
}

// Handler: Player ready status change (GM only)
function onPlayerReady(userId, ready) {
  if (!game.user.isGM) return;

  const sessionManager = game.sessionManager;
  if (sessionManager) {
    sessionManager.setPlayerReady(userId, ready);
  }
}

// Handler: Recap volunteer status change (GM only)
function onVolunteerRecap(userId, volunteering) {
  if (!game.user.isGM) return;

  const sessionManager = game.sessionManager;
  if (sessionManager) {
    sessionManager.setRecapVolunteer(userId, volunteering);
  }
}

// Handler: Show journal for all players
async function onShowJournal(journalId, pageId = null) {
  console.log(`${MODULE_ID} | Opening journal ${journalId}${pageId ? ` to page ${pageId}` : ''}`);

  try {
    const journal = await fromUuid(journalId);
    if (journal) {
      // Open to specific page if provided
      if (pageId) {
        journal.sheet.render(true, { pageId: pageId });
      } else {
        journal.sheet.render(true);
      }
    } else {
      console.error(`${MODULE_ID} | Journal ${journalId} not found`);
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Error opening journal:`, error);
  }
}

// Handler: Break started (for non-GM clients)
function onBreakStart(endTime, duration) {
  console.log(`${MODULE_ID} | Break started, ends at ${new Date(endTime)}`);

  const sessionManager = game.sessionManager;
  if (!sessionManager) return;

  // Update local state
  sessionManager.sessionState.breakActive = true;
  sessionManager.sessionState.breakEndTime = endTime;

  // Show break UI
  sessionManager.showBreakUI();
}

// Handler: Break ended (for non-GM clients)
function onBreakEnd() {
  console.log(`${MODULE_ID} | Break ended`);

  const sessionManager = game.sessionManager;
  if (!sessionManager) return;

  // Update local state
  sessionManager.sessionState.breakActive = false;
  sessionManager.sessionState.breakEndTime = null;

  // Close break UI
  sessionManager.closeBreakUI();
}

// Emit socket message (helper function)
export function emitSocket(action, data = {}) {
  if (!game.socket) {
    console.error(`${MODULE_ID} | Socket not available for emit`);
    return;
  }

  const payload = { action, ...data };
  game.socket.emit(`module.${MODULE_ID}`, payload);
}
