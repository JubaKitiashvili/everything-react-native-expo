'use strict';

(function () {
  var CONTEXT_PANELS = ['context-stats', 'context-timeline', 'knowledge-browser', 'budget-panel'];
  var TOGGLE_ID = 'context-toggle-panel';

  function checkAndRender() {
    fetch('/api/context/status')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.enabled) {
          hideToggle();
          showContextPanels();
          reloadContextData();
        } else {
          hideContextPanels();
          renderToggle();
        }
      })
      .catch(function () {
        hideContextPanels();
      });
  }

  function hideContextPanels() {
    CONTEXT_PANELS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  function showContextPanels() {
    // Don't force-show — let each panel decide when it has data
  }

  function reloadContextData() {
    if (window.contextPanel) {
      // Fetch initial stats
      fetch('/api/context/stats')
        .then(function (r) { return r.json(); })
        .then(function (d) { if (!d.error) window.contextPanel.updateStats(d); })
        .catch(function () {});
    }
    if (window.knowledgeBrowser) {
      window.knowledgeBrowser.load();
    }
    if (window.budgetPanel) {
      window.budgetPanel.load();
    }
  }

  function hideToggle() {
    var el = document.getElementById(TOGGLE_ID);
    if (el) el.style.display = 'none';
  }

  function renderToggle() {
    var el = document.getElementById(TOGGLE_ID);
    if (!el) return;
    el.style.display = '';
    el.innerHTML =
      '<h3>Context System</h3>' +
      '<div class="ctx-toggle-content">' +
        '<p class="ctx-toggle-desc">Context optimization tracks token usage, builds a knowledge base, and manages session continuity.</p>' +
        '<button class="ctx-btn ctx-enable-btn" id="ctx-enable-btn">Enable Context</button>' +
      '</div>';

    var btn = document.getElementById('ctx-enable-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        btn.textContent = 'Enabling...';
        fetch('/api/context/enable', { method: 'POST' })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data.ok) {
              checkAndRender();
            } else {
              btn.disabled = false;
              btn.textContent = 'Failed — Retry';
            }
          })
          .catch(function () {
            btn.disabled = false;
            btn.textContent = 'Failed — Retry';
          });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    checkAndRender();
  });
})();
