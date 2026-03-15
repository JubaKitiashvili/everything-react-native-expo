'use strict';

(function () {
  var BudgetPanel = {
    settings: null,

    load: function () {
      fetch('/api/context/budget')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          BudgetPanel.settings = data;
          BudgetPanel.render();
        })
        .catch(function () {});
    },

    save: function () {
      fetch('/api/context/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(BudgetPanel.settings)
      }).catch(function () {});
    },

    render: function () {
      var el = document.getElementById('budget-panel');
      if (!el || !this.settings) return;
      var s = this.settings;
      el.innerHTML = '<h3>Context Budget</h3>' +
        '<label class="ctx-toggle">' +
        '<input type="checkbox" id="budget-enabled" ' + (s.enabled ? 'checked' : '') + ' /> Enable Budget System' +
        '</label>' +
        '<div class="ctx-budget-settings" style="display:' + (s.enabled ? 'block' : 'none') + '">' +
        '<label>Session limit: <input type="number" id="budget-session" value="' + s.session_limit + '" class="ctx-input-sm" /> tokens</label>' +
        '<label>Overflow: <select id="budget-overflow" class="ctx-input-sm">' +
        '<option value="aggressive_truncation"' + (s.overflow === 'aggressive_truncation' ? ' selected' : '') + '>Aggressive truncation</option>' +
        '<option value="warn"' + (s.overflow === 'warn' ? ' selected' : '') + '>Warn only</option>' +
        '<option value="hard_stop"' + (s.overflow === 'hard_stop' ? ' selected' : '') + '>Hard stop</option>' +
        '</select></label>' +
        '<button class="ctx-btn" id="budget-save">Apply</button>' +
        '</div>';

      var enabledCb = document.getElementById('budget-enabled');
      if (enabledCb) {
        enabledCb.addEventListener('change', function (e) {
          BudgetPanel.settings.enabled = e.target.checked;
          BudgetPanel.render();
        });
      }
      var saveBtn = document.getElementById('budget-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          BudgetPanel.settings.session_limit = +document.getElementById('budget-session').value;
          BudgetPanel.settings.overflow = document.getElementById('budget-overflow').value;
          BudgetPanel.save();
        });
      }
    }
  };

  window.budgetPanel = BudgetPanel;
  document.addEventListener('DOMContentLoaded', function () { BudgetPanel.load(); });
})();
