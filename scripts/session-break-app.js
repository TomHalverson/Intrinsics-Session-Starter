// Session Break App - UI Application for break timer display

const MODULE_ID = "intrinsics-session-starter";

export class SessionBreakApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'session-break-display',
      classes: ['session-break-display'],
      template: null,
      popOut: true,
      minimizable: false,
      resizable: false,
      width: 350,
      height: "auto"
    });
  }

  constructor(options = {}) {
    super(options);
    this.timerInterval = null;
  }

  get title() {
    return 'Break Time';
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
      this.startTimerUpdate();
    }
  }

  // Generate HTML for break display
  generateHTML() {
    const sessionManager = game.sessionManager;
    const endTime = sessionManager?.sessionState?.breakEndTime;
    const remaining = endTime ? Math.max(0, endTime - Date.now()) : 0;
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    let html = `
      <div class="break-container">
        <div class="break-icon">
          <i class="fas fa-coffee"></i>
        </div>
        <h2 class="break-title">Break Time!</h2>
        <div class="break-timer" id="break-timer">${timeString}</div>
        <p class="break-message">Get a snack or something, but be back in time..or else</p>
    `;

    // GM controls
    if (game.user.isGM) {
      html += `
        <div class="gm-controls">
          <button class="end-break-btn">
            <i class="fas fa-play"></i> End Break Early
          </button>
        </div>
      `;
    }

    html += '</div>';

    return html;
  }

  // Start the timer update interval
  startTimerUpdate() {
    // Clear any existing interval
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    // Update every second
    this.timerInterval = setInterval(() => {
      this.updateTimer();
    }, 1000);
  }

  // Update the timer display
  updateTimer() {
    const sessionManager = game.sessionManager;
    const endTime = sessionManager?.sessionState?.breakEndTime;

    if (!endTime || !sessionManager?.sessionState?.breakActive) {
      this.close();
      return;
    }

    const remaining = Math.max(0, endTime - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const timerElement = this.element?.find('#break-timer');
    if (timerElement?.length) {
      timerElement.text(timeString);

      // Add warning class when less than 1 minute
      if (remaining < 60000) {
        timerElement.addClass('warning');
      }

      // Add urgent class when less than 10 seconds
      if (remaining < 10000) {
        timerElement.addClass('urgent');
      }
    }

    // Close if timer has ended
    if (remaining <= 0) {
      this.close();
    }
  }

  // Activate event listeners
  activateListeners(html) {
    super.activateListeners(html);

    // GM controls
    if (game.user.isGM) {
      html.find('.end-break-btn').click(() => {
        game.sessionManager?.endBreak();
      });
    }
  }

  // Clean up on close
  async close(options = {}) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    game.sessionBreakApp = null;
    return super.close(options);
  }
}
