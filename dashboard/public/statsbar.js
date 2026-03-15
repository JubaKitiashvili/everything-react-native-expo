/**
 * ERNE Dashboard — Bottom stats bar with session metrics
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
        '<span class="stats-label">DONE</span>' +
        '<span class="stats-value blue" id="statsTasksDone">0</span>' +
      '</div>' +
      '<div class="stats-item">' +
        '<span class="stats-label">WORKING</span>' +
        '<span class="stats-value green" id="statsWorking">0</span>' +
      '</div>' +
      '<div class="stats-item">' +
        '<span class="stats-label">PLANNING</span>' +
        '<span class="stats-value orange" id="statsPlanning">0</span>' +
      '</div>' +
      '<div class="stats-item">' +
        '<span class="stats-label">IDLE</span>' +
        '<span class="stats-value" id="statsIdle">11</span>' +
      '</div>' +
      '<div class="stats-item">' +
        '<span class="stats-label">UTILIZATION</span>' +
        '<span class="stats-value green" id="statsUtil">0%</span>' +
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
    var idle = 0;
    var total = 0;

    for (var name in lastAgents) {
      if (!lastAgents.hasOwnProperty(name)) continue;
      total++;
      var st = lastAgents[name].status;
      if (st === 'working') working++;
      else if (st === 'planning') planning++;
      else idle++;
    }

    if (total === 0) total = 11; // default agent count
    if (idle === 0 && working === 0 && planning === 0) idle = total;

    var util = total > 0 ? Math.round(((working + planning) / total) * 100) : 0;

    var wEl = document.getElementById('statsWorking');
    if (wEl) wEl.textContent = working;
    var pEl = document.getElementById('statsPlanning');
    if (pEl) pEl.textContent = planning;
    var iEl = document.getElementById('statsIdle');
    if (iEl) iEl.textContent = idle;
    var uEl = document.getElementById('statsUtil');
    if (uEl) uEl.textContent = util + '%';
  };

  const update = (agents) => {
    lastAgents = agents || {};
    updateCounts();

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
