// dashboard/public/insights-tab.js
(function () {
  'use strict';

  var container = null;

  function init(tabContent) {
    container = document.createElement('div');
    container.className = 'ins-container';
    tabContent.appendChild(container);
  }

  function activate() {
    container.innerHTML = '<div class="eco-loading"><div class="eco-skeleton"></div></div>';

    Promise.all([
      fetch('/api/insights/snapshots').then(function (r) { return r.json(); }),
      fetch('/api/insights/agents').then(function (r) { return r.json(); }),
    ]).then(function (results) {
      var snapshots = results[0].snapshots || [];
      var agents = results[1].agents || [];
      render(snapshots, agents);
    }).catch(function () {
      container.innerHTML = '<div class="eco-error">Could not load insights data.</div>';
    });
  }

  function deactivate() {}

  function render(snapshots, agents) {
    container.innerHTML = '';

    // Metric cards row
    var cardsRow = document.createElement('div');
    cardsRow.className = 'ins-cards';

    cardsRow.appendChild(makeCard('Audit Score', snapshots, 'auditScore', '#4CAF50'));
    cardsRow.appendChild(makeCard('Outdated Deps', snapshots, 'dependencies.outdated', '#FF9800'));
    cardsRow.appendChild(makeCard('Agent Tasks', snapshots, 'agents.tasksCompleted', '#2196F3'));

    container.appendChild(cardsRow);

    // Agent utilization
    if (agents.length > 0) {
      var utilSection = document.createElement('div');
      utilSection.className = 'ins-section';
      utilSection.innerHTML = '<h3 class="ins-section-title">Agent Utilization</h3>';

      agents.forEach(function (agent) {
        var bar = document.createElement('div');
        bar.className = 'ins-bar-row';
        var safePct = Math.max(0, Math.min(100, parseInt(agent.pct, 10) || 0));
        bar.innerHTML =
          '<span class="ins-bar-name">' + escapeHtml(agent.name) + '</span>' +
          '<div class="ins-bar-track"><div class="ins-bar-fill" style="width:' + safePct + '%"></div></div>' +
          '<span class="ins-bar-pct">' + safePct + '%</span>';
        utilSection.appendChild(bar);
      });

      container.appendChild(utilSection);
    }

    // Empty state
    if (snapshots.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'ins-empty';
      empty.innerHTML = '<p>No data yet. Insights are collected daily when the dashboard runs.</p>' +
        '<button class="eco-refresh-btn" id="ins-snap">Take Snapshot Now</button>';
      container.appendChild(empty);
      document.getElementById('ins-snap').addEventListener('click', function () {
        this.textContent = 'Collecting...';
        this.disabled = true;
        fetch('/api/insights/snapshot', { method: 'POST' })
          .then(function () { activate(); })
          .catch(function () {});
      });
    }
  }

  function makeCard(label, snapshots, field, color) {
    var card = document.createElement('div');
    card.className = 'ins-card';

    // Compute trend
    var sparkline = [];
    var current = 0;
    var delta = 0;
    var direction = 'flat';

    if (snapshots.length > 0) {
      var sorted = snapshots.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      sparkline = sorted.slice(-30).map(function (s) {
        var parts = field.split('.');
        var val = s;
        for (var i = 0; i < parts.length; i++) val = val ? val[parts[i]] : 0;
        return val || 0;
      });
      current = sparkline[sparkline.length - 1];
      var first = sparkline[0];
      delta = current - first;
      direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    }

    var deltaStr = (delta >= 0 ? '+' : '') + delta;
    var deltaClass = direction === 'up' ? 'green' : direction === 'down' ? 'red' : '';

    card.innerHTML =
      '<div class="ins-card-label">' + label + '</div>' +
      '<div class="ins-card-value">' + current + '</div>' +
      '<canvas class="ins-card-spark" width="120" height="30"></canvas>' +
      '<div class="ins-card-delta ' + deltaClass + '">' + deltaStr + '</div>';

    // Draw sparkline after append
    setTimeout(function () {
      var canvasEl = card.querySelector('.ins-card-spark');
      if (canvasEl && sparkline.length >= 2) {
        Sparkline.draw(canvasEl, sparkline, { color: color, fillColor: color.replace(')', ',0.1)').replace('rgb', 'rgba') });
      }
    }, 0);

    return card;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  Tabs.registerTab('insights', { init: init, activate: activate, deactivate: deactivate });
})();
