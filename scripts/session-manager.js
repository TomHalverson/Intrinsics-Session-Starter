// Session Manager - State management and step orchestration
const MODULE_ID = "intrinsics-session-starter";

export const STEPS = {
  INACTIVE: 0,
  READY_CHECK: 1,
  JOURNAL: 2,
  RECAP: 3,
  UNPAUSE: 4
};

export class SessionManager {
  constructor() {
    this.sessionState = {
      active: false,
      currentStep: STEPS.INACTIVE,
      players: new Map(),
      journalId: "",
      selectedRecapper: null,
      initiatingGM: null,
      autoAdvance: true
    };
  }

  // Start the session workflow
  startSessionWorkflow() {
    if (!game.user.isGM) {
      ui.notifications.error("Only the GM can start a session!");
      return;
    }

    if (this.sessionState.active) {
      ui.notifications.warn("A session is already in progress!");
      return;
    }

    console.log(`${MODULE_ID} | Starting session workflow`);

    // Initialize state
    this.sessionState.active = true;
    this.sessionState.currentStep = STEPS.READY_CHECK;
    this.sessionState.initiatingGM = game.user.id;
    this.sessionState.autoAdvance = game.settings.get(MODULE_ID, "autoAdvanceReady");
    this.sessionState.journalId = game.settings.get(MODULE_ID, "housekeepingJournalId");

    // Initialize players
    this.initializePlayers();

    // Broadcast state and show UI
    this.broadcastState();
    this.refreshUI();

    ui.notifications.info("Session workflow started!");
  }

  // Initialize player list from game.users
  initializePlayers() {
    this.sessionState.players.clear();

    game.users.forEach(user => {
      this.sessionState.players.set(user.id, {
        id: user.id,
        name: user.name,
        ready: false,
        wantsRecap: false,
        isGM: user.isGM,
        active: user.active
      });
    });
  }

  // Advance to next step
  advanceStep() {
    if (!game.user.isGM) return;

    console.log(`${MODULE_ID} | Advancing from step ${this.sessionState.currentStep}`);

    switch(this.sessionState.currentStep) {
      case STEPS.INACTIVE:
        this.sessionState.currentStep = STEPS.READY_CHECK;
        this.initializePlayers();
        break;

      case STEPS.READY_CHECK:
        this.sessionState.currentStep = STEPS.JOURNAL;
        this.openJournalForAll();
        break;

      case STEPS.JOURNAL:
        this.sessionState.currentStep = STEPS.RECAP;
        this.startRecapVoting();
        break;

      case STEPS.RECAP:
        this.sessionState.currentStep = STEPS.UNPAUSE;
        this.unpauseTime();
        break;

      case STEPS.UNPAUSE:
        this.endSession();
        return;
    }

    this.broadcastState();
    this.refreshUI();
  }

  // GM skip to next step
  skipStep() {
    if (!game.user.isGM) {
      ui.notifications.error("Only the GM can skip steps!");
      return;
    }

    console.log(`${MODULE_ID} | GM skipping step ${this.sessionState.currentStep}`);
    this.advanceStep();
  }

  // Set player ready status
  setPlayerReady(userId, ready) {
    if (!game.user.isGM) return;

    const player = this.sessionState.players.get(userId);
    if (player) {
      player.ready = ready;
      console.log(`${MODULE_ID} | Player ${player.name} ready: ${ready}`);

      this.broadcastState();
      this.refreshUI();

      // Check for auto-advance
      this.checkAutoAdvance();
    }
  }

  // Toggle player ready (called from client)
  togglePlayerReady(userId) {
    if (userId !== game.user.id) return;

    const player = this.sessionState.players.get(userId);
    if (!player) return;

    const newReadyState = !player.ready;

    // Emit socket message to GM
    if (game.socket) {
      game.socket.emit(`module.${MODULE_ID}`, {
        action: "playerReady",
        userId: userId,
        ready: newReadyState
      });
    }

    // Update locally if we're GM
    if (game.user.isGM) {
      this.setPlayerReady(userId, newReadyState);
    }
  }

  // Check if all players are ready and auto-advance if enabled
  checkAutoAdvance() {
    if (!this.sessionState.autoAdvance) return;
    if (this.sessionState.currentStep !== STEPS.READY_CHECK) return;

    const nonGMPlayers = Array.from(this.sessionState.players.values())
      .filter(p => !p.isGM);

    if (nonGMPlayers.length === 0) {
      console.log(`${MODULE_ID} | No players online, skipping auto-advance`);
      return;
    }

    const allReady = nonGMPlayers.every(p => p.ready);

    if (allReady) {
      console.log(`${MODULE_ID} | All players ready, auto-advancing`);
      ui.notifications.info("All players ready! Moving to next step...");
      setTimeout(() => this.advanceStep(), 1000);
    }
  }

  // Open journal for all clients
  async openJournalForAll() {
    const journalId = this.sessionState.journalId;

    // Validate journal exists
    const journal = await fromUuid(journalId);
    if (!journal) {
      ui.notifications.error("Housekeeping journal not found! Check module settings.");
      console.error(`${MODULE_ID} | Journal ${journalId} not found`);
      return;
    }

    console.log(`${MODULE_ID} | Opening journal ${journalId} for all players`);

    // Emit to all clients
    if (game.socket) {
      game.socket.emit(`module.${MODULE_ID}`, {
        action: "showJournal",
        journalId: journalId
      });
    }

    // Open on GM's client too
    journal.sheet.render(true);
  }

  // Start recap voting phase
  startRecapVoting() {
    console.log(`${MODULE_ID} | Starting recap voting`);

    // Reset all recap volunteers
    this.sessionState.players.forEach(player => {
      player.wantsRecap = false;
    });

    this.sessionState.selectedRecapper = null;
  }

  // Set recap volunteer
  setRecapVolunteer(userId, volunteering) {
    if (!game.user.isGM) return;

    const player = this.sessionState.players.get(userId);
    if (player) {
      player.wantsRecap = volunteering;
      console.log(`${MODULE_ID} | Player ${player.name} volunteering: ${volunteering}`);

      this.broadcastState();
      this.refreshUI();
    }
  }

  // Toggle recap volunteer (called from client)
  toggleRecapVolunteer(userId) {
    if (userId !== game.user.id) return;

    const player = this.sessionState.players.get(userId);
    if (!player) return;

    const newVolunteerState = !player.wantsRecap;

    // Emit socket message to GM
    if (game.socket) {
      game.socket.emit(`module.${MODULE_ID}`, {
        action: "volunteerRecap",
        userId: userId,
        volunteering: newVolunteerState
      });
    }

    // Update locally if we're GM
    if (game.user.isGM) {
      this.setRecapVolunteer(userId, newVolunteerState);
    }
  }

  // Select a specific recapper
  selectRecapper(userId) {
    if (!game.user.isGM) return;

    const player = this.sessionState.players.get(userId);
    if (!player) return;

    this.sessionState.selectedRecapper = userId;
    console.log(`${MODULE_ID} | Selected recapper: ${player.name}`);

    // Announce in chat
    this.announceRecapper(player);

    // Advance to next step
    setTimeout(() => this.advanceStep(), 1500);
  }

  // Select random recapper
  selectRandomRecapper() {
    if (!game.user.isGM) return;

    const nonGMPlayers = Array.from(this.sessionState.players.values())
      .filter(p => !p.isGM && p.active);

    if (nonGMPlayers.length === 0) {
      ui.notifications.warn("No players available for recap!");
      this.advanceStep();
      return;
    }

    // First try volunteers
    const volunteers = nonGMPlayers.filter(p => p.wantsRecap);

    let selectedPlayer;
    if (volunteers.length > 0) {
      selectedPlayer = volunteers[Math.floor(Math.random() * volunteers.length)];
    } else {
      // No volunteers, choose from all players
      selectedPlayer = nonGMPlayers[Math.floor(Math.random() * nonGMPlayers.length)];
    }

    this.selectRecapper(selectedPlayer.id);
  }

  // Skip recap entirely
  skipRecap() {
    if (!game.user.isGM) return;

    console.log(`${MODULE_ID} | Skipping recap`);

    ChatMessage.create({
      content: "<p><strong>Session Starting</strong> - Recap skipped by GM</p>",
      whisper: []
    });

    this.advanceStep();
  }

  // Announce selected recapper in chat
  async announceRecapper(player) {
    await ChatMessage.create({
      content: `<p><strong>${player.name}</strong> will recap the last session!</p>`,
      whisper: []
    });
  }

  // Unpause time and integrate with Simple Timekeeping
  async unpauseTime() {
    console.log(`${MODULE_ID} | Unpausing time`);

    const simpleTimekeeping = game.modules.get("simple-timekeeping");

    if (!simpleTimekeeping?.active) {
      ui.notifications.warn("Simple Timekeeping not active. Using standard unpause.");
      await game.togglePause(false);
      this.announceSessionStart();

      // Auto-close after 3 seconds
      setTimeout(() => this.endSession(), 3000);
      return;
    }

    try {
      // Try multiple API patterns
      let resumed = false;

      if (game.simpleTimekeeping?.resume) {
        await game.simpleTimekeeping.resume();
        resumed = true;
      } else if (game.simpleTimekeeping?.api?.resume) {
        await game.simpleTimekeeping.api.resume();
        resumed = true;
      } else if (simpleTimekeeping.api?.resume) {
        await simpleTimekeeping.api.resume();
        resumed = true;
      } else {
        // Fallback to standard unpause
        console.warn(`${MODULE_ID} | Simple Timekeeping API not found, using fallback`);
        await game.togglePause(false);
        resumed = true;
      }

      if (resumed) {
        ui.notifications.info("Time resumed!");
        this.announceSessionStart();
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Error resuming time:`, error);
      ui.notifications.error("Failed to resume time: " + error.message);

      // Try fallback
      try {
        await game.togglePause(false);
        this.announceSessionStart();
      } catch (fallbackError) {
        console.error(`${MODULE_ID} | Fallback unpause failed:`, fallbackError);
      }
    }

    // Auto-close after 3 seconds
    setTimeout(() => this.endSession(), 3000);
  }

  // Announce session start in chat
  async announceSessionStart() {
    await ChatMessage.create({
      content: `
        <div style="text-align: center; padding: 10px;">
          <h2 style="margin: 0; color: #4a9eff;">🎲 Session Started! 🎲</h2>
          <p style="margin: 5px 0;">Time is running. Good luck adventurers!</p>
        </div>
      `,
      whisper: []
    });
  }

  // End session workflow
  endSession() {
    if (!game.user.isGM) return;

    console.log(`${MODULE_ID} | Ending session workflow`);

    this.sessionState.active = false;
    this.sessionState.currentStep = STEPS.INACTIVE;

    this.broadcastState();

    // Close UI
    if (game.sessionStarterApp) {
      game.sessionStarterApp.close();
      game.sessionStarterApp = null;
    }
  }

  // Broadcast state to all clients (GM only)
  broadcastState() {
    if (!game.user.isGM) return;

    if (game.socket) {
      game.socket.emit(`module.${MODULE_ID}`, {
        action: "syncState",
        state: this.sessionStateToJSON()
      });
    }
  }

  // Convert sessionState to JSON-serializable object
  sessionStateToJSON() {
    return {
      active: this.sessionState.active,
      currentStep: this.sessionState.currentStep,
      players: Array.from(this.sessionState.players.entries()),
      journalId: this.sessionState.journalId,
      selectedRecapper: this.sessionState.selectedRecapper,
      initiatingGM: this.sessionState.initiatingGM,
      autoAdvance: this.sessionState.autoAdvance
    };
  }

  // Update state from GM broadcast (clients only)
  updateStateFromGM(stateJSON) {
    if (game.user.isGM) return;

    console.log(`${MODULE_ID} | Updating state from GM`, stateJSON);

    this.sessionState.active = stateJSON.active;
    this.sessionState.currentStep = stateJSON.currentStep;
    this.sessionState.players = new Map(stateJSON.players);
    this.sessionState.journalId = stateJSON.journalId;
    this.sessionState.selectedRecapper = stateJSON.selectedRecapper;
    this.sessionState.initiatingGM = stateJSON.initiatingGM;
    this.sessionState.autoAdvance = stateJSON.autoAdvance;

    this.refreshUI();
  }

  // Refresh UI
  refreshUI() {
    if (!this.sessionState.active) {
      // Close UI if session not active
      if (game.sessionStarterApp) {
        game.sessionStarterApp.close();
        game.sessionStarterApp = null;
      }
      return;
    }

    // Create or update UI
    if (!game.sessionStarterApp) {
      const SessionStarterApp = game.modules.get(MODULE_ID)?.sessionStarterApp;
      if (SessionStarterApp) {
        game.sessionStarterApp = new SessionStarterApp();
        game.sessionStarterApp.render(true);
      }
    } else {
      game.sessionStarterApp.updateDisplay();
    }
  }
}
