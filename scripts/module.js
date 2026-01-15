// Intrinsic's Session Starter - Main Module Entry Point
import { SessionManager } from './session-manager.js';
import { SessionStarterApp } from './session-starter-app.js';
import { SessionBreakApp } from './session-break-app.js';
import { initializeSocket } from './socket-handler.js';

const MODULE_ID = "intrinsics-session-starter";

// Initialize module
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing`);

  // Register module settings
  registerSettings();

  console.log(`${MODULE_ID} | Initialization complete`);
});

// Module ready
Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Ready`);

  // Migrate incorrect hero point path setting if needed
  const currentPath = game.settings.get(MODULE_ID, "heroPointPath");
  if (currentPath === "system.heroPoints.value") {
    console.log(`${MODULE_ID} | Migrating hero point path to correct PF2e location`);
    game.settings.set(MODULE_ID, "heroPointPath", "system.resources.heroPoints.value");
    ui.notifications.info("Session Starter: Fixed hero point path to system.resources.heroPoints.value");
  }

  // Initialize socket listener
  initializeSocket();

  // Create global SessionManager instance
  game.sessionManager = new SessionManager();

  // Store SessionStarterApp class for later instantiation
  const moduleData = game.modules.get(MODULE_ID);
  if (moduleData) {
    moduleData.sessionStarterApp = SessionStarterApp;
    moduleData.sessionBreakApp = SessionBreakApp;
  }

  // Expose public API
  if (moduleData) {
    moduleData.api = {
      startSession: () => {
        if (!game.user.isGM) {
          ui.notifications.error("Only the GM can start a session!");
          return;
        }
        game.sessionManager.startSessionWorkflow();
      },
      skipStep: () => {
        if (!game.user.isGM) {
          ui.notifications.error("Only the GM can skip steps!");
          return;
        }
        game.sessionManager.skipStep();
      },
      endSession: () => {
        if (!game.user.isGM) {
          ui.notifications.error("Only the GM can end the session!");
          return;
        }
        game.sessionManager.endSession();
      },
      startBreak: (minutes) => {
        if (!game.user.isGM) {
          ui.notifications.error("Only the GM can start a break!");
          return;
        }
        game.sessionManager.startBreak(minutes);
      },
      endBreak: () => {
        if (!game.user.isGM) {
          ui.notifications.error("Only the GM can end a break!");
          return;
        }
        game.sessionManager.endBreak();
      }
    };
  }

  console.log(`${MODULE_ID} | Module loaded successfully`);
});

// Register module settings
function registerSettings() {
  game.settings.register(MODULE_ID, "housekeepingJournalId", {
    name: "Housekeeping Journal UUID",
    hint: "The journal entry to show at session start (use format: JournalEntry.xxx)",
    scope: "world",
    config: true,
    type: String,
    default: "JournalEntry.TjSjnMBDFBC5VTeD"
  });

  game.settings.register(MODULE_ID, "autoAdvanceReady", {
    name: "Auto-Advance Ready Check",
    hint: "Automatically proceed to next step when all players are ready",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "readyCheckTimeout", {
    name: "Ready Check Timeout (seconds)",
    hint: "Time to wait before showing skip option (0 = no timeout). Not yet implemented.",
    scope: "world",
    config: true,
    type: Number,
    default: 120,
    range: {
      min: 0,
      max: 600,
      step: 30
    }
  });

  game.settings.register(MODULE_ID, "recapVotingTimeout", {
    name: "Recap Voting Timeout (seconds)",
    hint: "Time to wait for recap volunteers (0 = no timeout). Not yet implemented.",
    scope: "world",
    config: true,
    type: Number,
    default: 30,
    range: {
      min: 0,
      max: 300,
      step: 10
    }
  });

  game.settings.register(MODULE_ID, "heroPointPath", {
    name: "Hero/Mythic Point Attribute Path",
    hint: "The path to the hero point attribute on player characters (e.g., 'system.resources.heroPoints.value' for PF2e)",
    scope: "world",
    config: true,
    type: String,
    default: "system.resources.heroPoints.value"
  });

  game.settings.register(MODULE_ID, "awardHeroPointOnStart", {
    name: "Award Hero Point on Session Start",
    hint: "Automatically award a hero/mythic point to all players when the session starts.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "breakDuration", {
    name: "Break Duration (minutes)",
    hint: "Default duration for session breaks.",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    range: {
      min: 1,
      max: 30,
      step: 1
    }
  });
}
