/**
 * ERNE Dashboard — Client-side activity history manager
 */
(function () {
  'use strict';

  let historyData = {};

  const setHistory = (data) => {
    historyData = data || {};
  };

  const getAgentHistory = (agentName) => {
    return historyData[agentName] || [];
  };

  const getAgentStats = (agentName) => {
    const entries = getAgentHistory(agentName);
    const completions = entries.filter(e => e.type === 'complete');
    const totalTasks = completions.length;
    const totalMs = completions.reduce((sum, e) => sum + (e.durationMs || 0), 0);
    const avgMs = totalTasks > 0 ? Math.round(totalMs / totalTasks) : 0;
    return { totalTasks, totalMs, avgMs };
  };

  const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '--';
    if (ms < 1000) return ms + 'ms';
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return m + 'm ' + rs + 's';
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatRelativeTime = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  };

  const getHistory = () => historyData;

  const getAllEntries = () => {
    var all = [];
    for (var agent in historyData) {
      if (!historyData.hasOwnProperty(agent)) continue;
      var entries = historyData[agent] || [];
      entries.forEach(function (e) {
        all.push(Object.assign({ agent: agent }, e));
      });
    }
    all.sort(function (a, b) {
      return new Date(b.timestamp || b.completedAt || 0) - new Date(a.timestamp || a.completedAt || 0);
    });
    return all;
  };

  window.History = {
    setHistory,
    getHistory,
    getAllEntries,
    getAgentHistory,
    getAgentStats,
    formatDuration,
    formatTime,
    formatRelativeTime,
  };
})();
