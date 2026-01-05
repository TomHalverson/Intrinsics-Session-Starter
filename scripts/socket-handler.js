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
      onShowJournal(data.journalId);
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
async function onShowJournal(journalId) {
  console.log(`${MODULE_ID} | Opening journal ${journalId}`);

  try {
    const journal = await fromUuid(journalId);
    if (journal) {
      journal.sheet.render(true);
    } else {
      console.error(`${MODULE_ID} | Journal ${journalId} not found`);
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Error opening journal:`, error);
  }
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
