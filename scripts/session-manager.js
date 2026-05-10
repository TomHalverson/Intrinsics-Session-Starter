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
      autoAdvance: true,
      // Break state
      breakActive: false,
      breakEndTime: null,
      breakTimerId: null
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

  // Initialize player list from online users only
  initializePlayers() {
    this.sessionState.players.clear();

    game.users.forEach(user => {
      if (!user.active) return; // Skip offline users

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

    // Get the last page ID
    const pages = journal.pages?.contents || [];
    const lastPage = pages.length > 0 ? pages[pages.length - 1] : null;
    const lastPageId = lastPage?.id || null;

    // Emit to all clients
    if (game.socket) {
      game.socket.emit(`module.${MODULE_ID}`, {
        action: "showJournal",
        journalId: journalId,
        pageId: lastPageId
      });
    }

    // Open on GM's client too, to last page
    if (lastPageId) {
      journal.sheet.render(true, { pageId: lastPageId });
    } else {
      journal.sheet.render(true);
    }
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
    // Award 1 extra hero point to the recapper (bonus for doing the recap)
    // They already get 1 from session start, so this gives them 2 total
    const awardHeroPoints = game.settings.get(MODULE_ID, "awardHeroPointOnStart");
    console.log(`${MODULE_ID} | [DEBUG] announceRecapper - awardHeroPoints setting: ${awardHeroPoints}, isGM: ${game.user.isGM}`);
    
    if (awardHeroPoints && game.user.isGM) {
      await this.awardHeroPointToPlayer(player.id, 1, "doing the recap");
    }

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
      await this.announceSessionStart();

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
        await this.announceSessionStart();
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Error resuming time:`, error);
      ui.notifications.error("Failed to resume time: " + error.message);

      // Try fallback
      try {
        await game.togglePause(false);
        await this.announceSessionStart();
      } catch (fallbackError) {
        console.error(`${MODULE_ID} | Fallback unpause failed:`, fallbackError);
      }
    }

    // Auto-close after 3 seconds
    setTimeout(() => this.endSession(), 3000);
  }

  // Announce session start in chat
  async announceSessionStart() {
    // Award hero points if enabled
    const awardHeroPoints = game.settings.get(MODULE_ID, "awardHeroPointOnStart");
    console.log(`${MODULE_ID} | [DEBUG] announceSessionStart - awardHeroPointOnStart setting: ${awardHeroPoints}, isGM: ${game.user.isGM}`);
    
    if (awardHeroPoints && game.user.isGM) {
      console.log(`${MODULE_ID} | [DEBUG] Calling awardHeroPointsToAllPlayers for Session Start`);
      await this.awardHeroPointsToAllPlayers("Session Start");
    } else {
      console.log(`${MODULE_ID} | [DEBUG] Skipping hero point award - awardHeroPoints: ${awardHeroPoints}, isGM: ${game.user.isGM}`);
    }

    await ChatMessage.create({
      content: `
        <div style="text-align: center; padding: 10px;">
          <h2 style="margin: 0; color: #4a9eff;">Session Started!</h2>
          <p style="margin: 5px 0;">Time is running. Try not to die!</p>
        </div>
      `,
      whisper: []
    });
  }

  // Get the mythic or hero point resource from a PF2e character.
  // Mirrors the approach used by pf2e-hud: checks mythicPoints first,
  // falls back to heroPoints. Returns {name, value, max} or null.
  _getHeroOrMythicResource(character) {
    const resources = character.system?.resources;
    if (!resources) {
      console.warn(`${MODULE_ID} | ${character.name} has no system.resources`);
      return null;
    }

    // If mythic points have a max > 0, use those instead (same logic as pf2e-hud)
    if (resources.mythicPoints?.max > 0) {
      console.log(`${MODULE_ID} | Using mythicPoints for ${character.name} (value: ${resources.mythicPoints.value}, max: ${resources.mythicPoints.max})`);
      return {
        name: "mythicPoints",
        value: resources.mythicPoints.value ?? 0,
        max: resources.mythicPoints.max
      };
    }

    if (resources.heroPoints) {
      console.log(`${MODULE_ID} | Using heroPoints for ${character.name} (value: ${resources.heroPoints.value}, max: ${resources.heroPoints.max})`);
      return {
        name: "heroPoints",
        value: resources.heroPoints.value ?? 0,
        max: resources.heroPoints.max ?? 3
      };
    }

    console.warn(`${MODULE_ID} | ${character.name} has no heroPoints or mythicPoints in system.resources`);
    return null;
  }

  // Award hero/mythic points to all active player characters
  async awardHeroPointsToAllPlayers(reason = "Session Reward") {
    if (!game.user.isGM) return;

    console.log(`${MODULE_ID} | Awarding hero points to all players — reason: ${reason}`);

    const awardedPlayers = [];

    for (const user of game.users) {
      if (user.isGM || !user.active) continue;

      const character = user.character;
      if (!character) {
        console.log(`${MODULE_ID} | Skipping ${user.name} — no assigned character`);
        continue;
      }

      try {
        const resource = this._getHeroOrMythicResource(character);
        if (!resource) continue;

        const newValue = Math.min(resource.value + 1, resource.max);
        if (newValue === resource.value) {
          console.log(`${MODULE_ID} | ${character.name} already at max ${resource.name} (${resource.value}/${resource.max})`);
          awardedPlayers.push(character.name);
          continue;
        }

        // Update exactly like pf2e-hud does: system.resources.<name>.value
        await character.update({ [`system.resources.${resource.name}.value`]: newValue });

        awardedPlayers.push(character.name);
        console.log(`${MODULE_ID} | Awarded ${resource.name} to ${character.name} (${resource.value} → ${newValue})`);
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to award hero point to ${character.name}:`, error);
        ui.notifications.error(`Failed to award point to ${character.name}: ${error.message}`);
      }
    }

    // Chat message
    if (awardedPlayers.length > 0) {
      const playerList = awardedPlayers.map(name => `<li>${name}</li>`).join('');
      await ChatMessage.create({
        content: `
          <div style="text-align: center; padding: 8px; background: linear-gradient(135deg, rgba(250, 204, 21, 0.2) 0%, rgba(234, 179, 8, 0.2) 100%); border-radius: 8px; border: 1px solid rgba(250, 204, 21, 0.5);">
            <h4 style="margin: 0 0 8px 0; color: #fbbf24;"><i class="fas fa-star"></i> Hero Points Awarded!</h4>
            <p style="margin: 0 0 8px 0; font-size: 12px; color: #9CA3AF;">${reason}</p>
            <ul style="list-style: none; padding: 0; margin: 0; color: #E5E7EB;">${playerList}</ul>
          </div>
        `,
        whisper: []
      });
    }

    return awardedPlayers;
  }

  // Award hero/mythic points to a specific player
  async awardHeroPointToPlayer(userId, amount = 1, reason = "Reward") {
    if (!game.user.isGM) return;

    const user = game.users.get(userId);
    if (!user || user.isGM) return;

    const character = user.character;
    if (!character) {
      console.log(`${MODULE_ID} | User ${user.name} has no assigned character, skipping bonus award`);
      return;
    }

    try {
      const resource = this._getHeroOrMythicResource(character);
      if (!resource) return;

      const newValue = Math.min(resource.value + amount, resource.max);

      // Update exactly like pf2e-hud does: system.resources.<name>.value
      await character.update({ [`system.resources.${resource.name}.value`]: newValue });

      console.log(`${MODULE_ID} | Awarded ${amount} bonus ${resource.name} to ${character.name} (${resource.value} → ${newValue})`);

      await ChatMessage.create({
        content: `
          <div style="text-align: center; padding: 8px; background: linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%); border-radius: 8px; border: 1px solid rgba(168, 85, 247, 0.5);">
            <h4 style="margin: 0 0 4px 0; color: #a855f7;"><i class="fas fa-star"></i> Bonus Hero Point!</h4>
            <p style="margin: 0; color: #E5E7EB;"><strong>${character.name}</strong> received ${amount} bonus point${amount > 1 ? 's' : ''} for ${reason}!</p>
          </div>
        `,
        whisper: []
      });

      return character.name;
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to award hero point to ${character.name}:`, error);
      ui.notifications.error(`Failed to award point to ${character.name}: ${error.message}`);
    }
  }

  // Start a session break with timer
  async startBreak(minutes = null) {
    if (!game.user.isGM) {
      ui.notifications.error("Only the GM can start a break!");
      return;
    }

    if (this.sessionState.breakActive) {
      ui.notifications.warn("A break is already in progress!");
      return;
    }

    // Use provided minutes or get from settings
    const breakMinutes = minutes ?? game.settings.get(MODULE_ID, "breakDuration");
    const breakDurationMs = breakMinutes * 60 * 1000;

    console.log(`${MODULE_ID} | Starting ${breakMinutes} minute break`);

    this.sessionState.breakActive = true;
    this.sessionState.breakEndTime = Date.now() + breakDurationMs;

    // Pause the game if Simple Timekeeping is active
    this.pauseForBreak();

    // Set up auto-end timer (GM only)
    this.sessionState.breakTimerId = setTimeout(() => {
      this.endBreak();
    }, breakDurationMs);

    // Broadcast state and show UI
    this.broadcastState();

    // Emit break start to show UI on all clients
    if (game.socket) {
      game.socket.emit(`module.${MODULE_ID}`, {
        action: "breakStart",
        endTime: this.sessionState.breakEndTime,
        duration: breakMinutes
      });
    }

    // Show break UI
    this.showBreakUI();

    // Award hero points at break start
    await this.awardHeroPointsToAllPlayers("Break Reward");

    // Announce in chat
    ChatMessage.create({
      content: `
        <div style="text-align: center; padding: 10px; background: linear-gradient(135deg, rgba(96, 165, 250, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%); border-radius: 8px; border: 1px solid rgba(96, 165, 250, 0.5);">
          <h3 style="margin: 0 0 8px 0; color: #60a5fa;"><i class="fas fa-coffee"></i> Break Time!</h3>
          <p style="margin: 0; color: #E5E7EB;">Taking a <strong>${breakMinutes} minute</strong> break.</p>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #9CA3AF;">Stretch, hydrate, and return refreshed!</p>
        </div>
      `,
      whisper: []
    });

    ui.notifications.info(`Break started! ${breakMinutes} minutes.`);
  }

  // End the break and award hero points
  async endBreak() {
    if (!game.user.isGM) return;

    if (!this.sessionState.breakActive) return;

    console.log(`${MODULE_ID} | Ending break`);

    // Clear the timer if it exists
    if (this.sessionState.breakTimerId) {
      clearTimeout(this.sessionState.breakTimerId);
      this.sessionState.breakTimerId = null;
    }

    // Resume time
    await this.resumeFromBreak();

    this.sessionState.breakActive = false;
    this.sessionState.breakEndTime = null;

    // Broadcast state
    this.broadcastState();

    // Emit break end to all clients
    if (game.socket) {
      game.socket.emit(`module.${MODULE_ID}`, {
        action: "breakEnd"
      });
    }

    // Close break UI
    this.closeBreakUI();

    // Announce in chat
    await ChatMessage.create({
      content: `
        <div style="text-align: center; padding: 10px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%); border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.5);">
          <h3 style="margin: 0 0 8px 0; color: #10b981;"><i class="fas fa-play-circle"></i> Break Over!</h3>
          <p style="margin: 0; color: #E5E7EB;">Welcome back! The adventure continues...</p>
        </div>
      `,
      whisper: []
    });

    ui.notifications.info("Break ended!");
  }

  // Pause game for break
  async pauseForBreak() {
    const simpleTimekeeping = game.modules.get("simple-timekeeping");

    if (simpleTimekeeping?.active) {
      try {
        if (game.simpleTimekeeping?.pause) {
          await game.simpleTimekeeping.pause();
        } else if (game.simpleTimekeeping?.api?.pause) {
          await game.simpleTimekeeping.api.pause();
        } else if (simpleTimekeeping.api?.pause) {
          await simpleTimekeeping.api.pause();
        } else {
          await game.togglePause(true);
        }
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not pause Simple Timekeeping:`, error);
        await game.togglePause(true);
      }
    } else {
      await game.togglePause(true);
    }
  }

  // Resume game from break
  async resumeFromBreak() {
    const simpleTimekeeping = game.modules.get("simple-timekeeping");

    if (simpleTimekeeping?.active) {
      try {
        if (game.simpleTimekeeping?.resume) {
          await game.simpleTimekeeping.resume();
        } else if (game.simpleTimekeeping?.api?.resume) {
          await game.simpleTimekeeping.api.resume();
        } else if (simpleTimekeeping.api?.resume) {
          await simpleTimekeeping.api.resume();
        } else {
          await game.togglePause(false);
        }
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not resume Simple Timekeeping:`, error);
        await game.togglePause(false);
      }
    } else {
      await game.togglePause(false);
    }
  }

  // Show break UI on all clients
  showBreakUI() {
    if (!game.sessionBreakApp) {
      const SessionBreakApp = game.modules.get(MODULE_ID)?.sessionBreakApp;
      if (SessionBreakApp) {
        game.sessionBreakApp = new SessionBreakApp();
        game.sessionBreakApp.render(true);
      }
    } else {
      game.sessionBreakApp.render(true);
    }
  }

  // Close break UI
  closeBreakUI() {
    if (game.sessionBreakApp) {
      game.sessionBreakApp.close();
      game.sessionBreakApp = null;
    }
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
      autoAdvance: this.sessionState.autoAdvance,
      breakActive: this.sessionState.breakActive,
      breakEndTime: this.sessionState.breakEndTime
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
    this.sessionState.breakActive = stateJSON.breakActive;
    this.sessionState.breakEndTime = stateJSON.breakEndTime;

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
