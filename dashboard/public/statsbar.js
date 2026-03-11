/**
 * ERNE Dashboard — Bottom stats bar showing session metrics
 */
(function () {
  'use strict';

  let barEl = null;
  let sessionStart = Date.now();
  let lastAgents = {};

  const init = (container) => {
    sessionStart = Date.now();

    barEl = document.createElement('div');
    barEl.className = 'stats-bar';
    barEl.innerHTML =
      '<div class="stats-item">' +
        '<span class="stats-label">SESSION</span>' +
        '<span class="stats-value" id="statsDuration">0m 0s</span>' +
      '</div>' +
      '<div class="stats-item">' +
        '<span class="stats-label">TASKS DONE</span>' +
        '<span class="stats-value" id="statsTasksDone">0</span>' +
      '</div>' +
      '<div class="stats-item">' +
        '<span class="stats-label">WORKING</span>' +
        '<span class="stats-value" id="statsWorking">0</span>' +
      '</div>' +
      '<div class="stats-item">' +
        '<span class="stats-label">PLANNING</span>' +
        '<span class="stats-value" id="statsPlanning">0</span>' +
      '</div>';
    container.appendChild(barEl);

    setInterval(tick, 1000);
  };

  const tick = () => {
    var elapsed = Date.now() - sessionStart;
    var s = Math.floor(elapsed / 1000) % 60;
    var m = Math.floor(elapsed / 60000);
    var el = document.getElementById('statsDuration');
    if (el) el.textContent = m + 'm ' + s + 's';

    updateCounts();
  };

  const updateCounts = () => {
    var working = 0;
    var planning = 0;
    for (var name in lastAgents) {
      if (lastAgents[name].status === 'working') working++;
      if (lastAgents[name].status === 'planning') planning++;
    }
    var wEl = document.getElementById('statsWorking');
    if (wEl) wEl.textContent = working;
    var pEl = document.getElementById('statsPlanning');
    if (pEl) pEl.textContent = planning;
  };

  const update = (agents) => {
    lastAgents = agents || {};
    updateCounts();

    // Update tasks done from history
    var stats = { totalTasks: 0 };
    var allAgents = Object.keys(agents || {});
    for (var i = 0; i < allAgents.length; i++) {
      var s = History.getAgentStats(allAgents[i]);
      stats.totalTasks += s.totalTasks;
    }
    var tdEl = document.getElementById('statsTasksDone');
    if (tdEl) tdEl.textContent = stats.totalTasks;
  };

  window.StatsBar = { init, update };
})();
