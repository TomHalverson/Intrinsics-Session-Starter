// Session Starter App - UI Application class for persistent dialog
import { STEPS } from './session-manager.js';

const MODULE_ID = "intrinsics-session-starter";

export class SessionStarterApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'session-starter-display',
      classes: ['session-starter-display'],
      template: null, // Dynamic HTML generation
      popOut: true,
      minimizable: false,
      resizable: false,
      width: 420,
      height: "auto"
    });
  }

  get title() {
    const sessionManager = game.sessionManager;
    if (!sessionManager) return 'Session Starter';

    const step = sessionManager.sessionState.currentStep;

    switch(step) {
      case STEPS.READY_CHECK:
        return 'Session Starting - Ready Check';
      case STEPS.JOURNAL:
        return 'Housekeeping Journal';
      case STEPS.RECAP:
        return 'Who Will Recap?';
      case STEPS.UNPAUSE:
        return 'Session Started!';
      default:
        return 'Session Starter';
    }
  }

  async getData() {
    return {};
  }

  async _renderInner(data) {
    const html = await this.generateHTML();
    return $(html);
  }

  async _render(force = false, options = {}) {
    await super._render(force, options);

    if (this.element) {
      this.activateListeners(this.element);
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

    let html = `<ul class="player-list">`;

    // List all non-GM players
    for (const [userId, player] of players) {
      if (player.isGM) continue;

      const readyClass = player.ready ? 'ready' : 'waiting';
      const statusText = player.ready ? 'Ready' : 'Waiting';

      html += `
        <li class="player-item ${readyClass}">
          <span class="player-name">${player.name}</span>
          <span class="player-status">${statusText}</span>
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

    return html;
  }

  // Generate Journal Display HTML
  generateJournalHTML() {
    let html = `
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

    return html;
  }

  // Generate Recap Voting HTML
  generateRecapHTML() {
    const sessionManager = game.sessionManager;
    const players = sessionManager.sessionState.players;

    let html = `<p class="instructions">Who wants to recap the last session?</p>`;

    // List volunteers
    const volunteers = Array.from(players.values()).filter(p => !p.isGM && p.wantsRecap);

    if (volunteers.length > 0) {
      html += '<ul class="player-list">';
      for (const player of volunteers) {
        html += `
          <li class="player-item volunteering">
            <span class="player-name">${player.name}</span>
            <span class="player-status">Volunteering</span>
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

    return html;
  }

  // Generate Unpause HTML
  generateUnpauseHTML() {
    return `
      <div class="session-success">
        <i class="fas fa-play-circle"></i>
        <h2>Time Resumed</h2>
        <p>The session has begun!</p>
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

    // Update title
    this.element.find('.window-title').text(this.title);

    // Update content
    const content = this.element.find('.window-content');
    if (content.length > 0) {
      content.html(html);
      this.activateListeners(this.element);
    }
  }
}
