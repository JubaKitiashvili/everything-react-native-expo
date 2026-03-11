/**
 * ERNE Dashboard — Toast notifications for agent completions
 */
(function () {
  'use strict';

  let containerEl = null;
  const MAX_TOASTS = 4;
  const TOAST_DURATION = 4000;

  const init = () => {
    containerEl = document.createElement('div');
    containerEl.className = 'toast-container';
    document.body.appendChild(containerEl);
  };

  const show = (agentName, task, type) => {
    if (!containerEl) return;

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'complete');
    var icon = type === 'start' ? '\u25B6' : '\u2713';
    var label = type === 'start' ? 'started' : 'completed';
    toast.innerHTML =
      '<span class="toast-icon">' + icon + '</span>' +
      '<div class="toast-body">' +
        '<div class="toast-agent">' + agentName + ' ' + label + '</div>' +
        '<div class="toast-task">' + escapeHtml(task || '') + '</div>' +
      '</div>';

    containerEl.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(function () {
      toast.classList.add('toast-visible');
    });

    // Remove excess toasts
    while (containerEl.children.length > MAX_TOASTS) {
      containerEl.removeChild(containerEl.firstChild);
    }

    // Auto-remove
    setTimeout(function () {
      toast.classList.remove('toast-visible');
      toast.classList.add('toast-exit');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, TOAST_DURATION);
  };

  const escapeHtml = (str) => {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  window.Toasts = { init, show };
})();
