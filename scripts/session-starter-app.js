// Session Starter App - UI Application class for persistent dialog
import { STEPS } from './session-manager.js';

const MODULE_ID = "intrinsics-session-starter";

export class SessionStarterApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'session-starter-display',
      classes: ['session-starter-display'],
      template: null, // Dynamic HTML generation
      popOut: false,
      minimizable: false,
      resizable: false,
      width: 420,
      zIndex: 1000
    });
  }

  get title() {
    return 'Session Starter';
  }

  async _renderInner(data) {
    const html = await this.generateHTML();
    return $(html);
  }

  async _render(force = false, options = {}) {
    await super._render(force, options);

    if (this.element) {
      this.positionDisplay();
    }
  }

  // Generate HTML based on current step
  async generateHTML() {
    const sessionManager = game.sessionManager;
    if (!sessionManager) return '<div>Session Manager not initialized</div>';

    const step = sessionManager.sessionState.currentStep;

    switch(step) {
      case STEPS.READY_CHECK:
        return this.generateReadyCheckHTML();
      case STEPS.JOURNAL:
        return this.generateJournalHTML();
      case STEPS.RECAP:
        return this.generateRecapHTML();
      case STEPS.UNPAUSE:
        return this.generateUnpauseHTML();
      default:
        return '<div>Session Inactive</div>';
    }
  }

  // Generate Ready Check HTML
  generateReadyCheckHTML() {
    const sessionManager = game.sessionManager;
    const players = sessionManager.sessionState.players;

    let html = `
      <div class="window-header">
        <h3 class="window-title">
          <i class="fas fa-clock"></i> Session Starting - Ready Check
        </h3>
      </div>
      <div class="window-content">
        <ul class="player-list">
    `;

    // List all non-GM players
    for (const [userId, player] of players) {
      if (player.isGM) continue;

      const readyClass = player.ready ? 'ready' : 'waiting';
      const statusIcon = player.ready ? '✓' : '⏳';

      html += `
        <li class="player-item ${readyClass}">
          <span class="player-name">${player.name}</span>
          <span class="player-status">${statusIcon}</span>
        </li>
      `;
    }

    html += '</ul>';

    // Player button (non-GM)
    if (!game.user.isGM) {
      const currentPlayer = players.get(game.user.id);
      const isReady = currentPlayer?.ready ?? false;
      const buttonText = isReady ? "Not Ready" : "I'm Ready!";
      const buttonClass = isReady ? "session-btn ready active" : "session-btn";

      html += `
        <button class="ready-toggle ${buttonClass}">
          <i class="fas fa-check"></i> ${buttonText}
        </button>
      `;
    }

    // GM controls
    if (game.user.isGM) {
      const readyCount = Array.from(players.values()).filter(p => !p.isGM && p.ready).length;
      const totalPlayers = Array.from(players.values()).filter(p => !p.isGM).length;

      html += `
        <div class="gm-info">
          <p><strong>${readyCount}/${totalPlayers}</strong> players ready</p>
        </div>
        <div class="gm-controls">
          <button class="skip-step">
            <i class="fas fa-forward"></i> Skip to Next Step
          </button>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  // Generate Journal Display HTML
  generateJournalHTML() {
    let html = `
      <div class="window-header">
        <h3 class="window-title">
          <i class="fas fa-book"></i> Housekeeping Journal
        </h3>
      </div>
      <div class="window-content">
        <div class="info-message">
          <i class="fas fa-info-circle"></i>
          <p>Journal opened for all players. Review the housekeeping items.</p>
        </div>
    `;

    // GM controls
    if (game.user.isGM) {
      html += `
        <div class="gm-controls">
          <button class="skip-step">
            <i class="fas fa-forward"></i> Skip to Next Step
          </button>
        </div>
      `;
    } else {
      html += `
        <p class="waiting-message">Waiting for GM to continue...</p>
      `;
    }

    html += '</div>';
    return html;
  }

  // Generate Recap Voting HTML
  generateRecapHTML() {
    const sessionManager = game.sessionManager;
    const players = sessionManager.sessionState.players;

    let html = `
      <div class="window-header">
        <h3 class="window-title">
          <i class="fas fa-history"></i> Who Will Recap?
        </h3>
      </div>
      <div class="window-content">
        <p class="instructions">Who wants to recap the last session?</p>
    `;

    // List volunteers
    const volunteers = Array.from(players.values()).filter(p => !p.isGM && p.wantsRecap);

    if (volunteers.length > 0) {
      html += '<ul class="player-list">';
      for (const player of volunteers) {
        html += `
          <li class="player-item volunteering">
            <span class="player-name">${player.name}</span>
            <span class="player-status">🙋</span>
          </li>
        `;
      }
      html += '</ul>';
    } else {
      html += '<p class="no-volunteers">No volunteers yet...</p>';
    }

    // Player button (non-GM)
    if (!game.user.isGM) {
      const currentPlayer = players.get(game.user.id);
      const isVolunteering = currentPlayer?.wantsRecap ?? false;
      const buttonText = isVolunteering ? "Cancel Volunteer" : "I Want to Recap";
      const buttonClass = isVolunteering ? "session-btn volunteer active" : "session-btn volunteer";

      html += `
        <button class="volunteer-recap ${buttonClass}">
          <i class="fas fa-hand-paper"></i> ${buttonText}
        </button>
      `;
    }

    // GM controls
    if (game.user.isGM) {
      html += '<div class="gm-controls">';

      // Show select buttons for each volunteer
      if (volunteers.length > 0) {
        html += '<div class="volunteer-buttons">';
        for (const player of volunteers) {
          html += `
            <button class="select-recapper" data-user-id="${player.id}">
              Select ${player.name}
            </button>
          `;
        }
        html += '</div>';
      }

      html += `
        <button class="random-recapper">
          <i class="fas fa-dice"></i> Select Random
        </button>
        <button class="skip-recap">
          <i class="fas fa-forward"></i> Skip Recap
        </button>
      `;
      html += '</div>';
    } else {
      html += '<p class="waiting-message">Waiting for GM to select recapper...</p>';
    }

    html += '</div>';
    return html;
  }

  // Generate Unpause HTML
  generateUnpauseHTML() {
    return `
      <div class="window-header">
        <h3 class="window-title">
          <i class="fas fa-check-circle"></i> Session Started!
        </h3>
      </div>
      <div class="window-content">
        <div class="session-success">
          <i class="fas fa-play-circle"></i>
          <h2>Time Resumed</h2>
          <p>The session has begun. Good luck!</p>
        </div>
      </div>
    `;
  }

  // Activate event listeners
  activateListeners(html) {
    super.activateListeners(html);

    const sessionManager = game.sessionManager;
    if (!sessionManager) return;

    // Player controls
    html.find('.ready-toggle').click(() => {
      sessionManager.togglePlayerReady(game.user.id);
    });

    html.find('.volunteer-recap').click(() => {
      sessionManager.toggleRecapVolunteer(game.user.id);
    });

    // GM controls
    if (game.user.isGM) {
      html.find('.skip-step').click(() => {
        sessionManager.skipStep();
      });

      html.find('.select-recapper').click((event) => {
        const userId = event.currentTarget.dataset.userId;
        sessionManager.selectRecapper(userId);
      });

      html.find('.random-recapper').click(() => {
        sessionManager.selectRandomRecapper();
      });

      html.find('.skip-recap').click(() => {
        sessionManager.skipRecap();
      });
    }
  }

  // Update display (re-render)
  async updateDisplay() {
    if (!this.element) return;

    const html = await this.generateHTML();
    this.element.html(html);
    this.activateListeners(this.element);
  }

  // Position display on screen
  positionDisplay() {
    if (!this.element) return;

    const element = this.element[0];

    element.style.position = 'fixed';
    element.style.top = '50%';
    element.style.left = '50%';
    element.style.transform = 'translate(-50%, -50%)';
    element.style.zIndex = '1000';
  }
}
