// Intrinsic's Session Starter - Session Control Macro
// Provides options to:
// 1. Start Session - Triggers the 4-step session startup workflow
//    (awards hero point to all players, recapper gets 2 total)
// 2. Start Break - Triggers a timed break with hero point reward at start

if (!game.user.isGM) {
  ui.notifications.error("Only the GM can use this macro!");
  return;
}

const api = game.modules.get("intrinsics-session-starter")?.api;

if (!api) {
  ui.notifications.error("Intrinsic's Session Starter module not loaded!");
  return;
}

const defaultDuration = game.settings.get("intrinsics-session-starter", "breakDuration") || 10;

new Dialog({
  title: "Session Control",
  content: `
    <div style="text-align: center; margin-bottom: 16px;">
      <p style="margin: 0; color: #666;">What would you like to do?</p>
    </div>
    <div id="break-options" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px solid #ccc;">
      <div class="form-group">
        <label>Break Duration (minutes):</label>
        <input type="number" name="duration" value="${defaultDuration}" min="1" max="60" style="width: 100%;">
      </div>
      <p style="font-size: 11px; color: #888; margin-top: 8px;">
        A hero/mythic point will be awarded when the break starts.
      </p>
    </div>
  `,
  buttons: {
    startSession: {
      icon: '<i class="fas fa-play-circle"></i>',
      label: "Start Session",
      callback: () => {
        api.startSession();
      }
    },
    startBreak: {
      icon: '<i class="fas fa-coffee"></i>',
      label: "Start Break",
      callback: (html) => {
        const duration = parseInt(html.find('[name="duration"]').val()) || defaultDuration;
        api.startBreak(duration);
      }
    },
    cancel: {
      icon: '<i class="fas fa-times"></i>',
      label: "Cancel"
    }
  },
  default: "startSession",
  render: (html) => {
    // Show break options when hovering/focusing on the break button
    const breakBtn = html.find('button[data-button="startBreak"]');
    const breakOptions = html.find('#break-options');
    
    breakBtn.on('mouseenter focus', () => {
      breakOptions.slideDown(200);
    });
  }
}).render(true);
