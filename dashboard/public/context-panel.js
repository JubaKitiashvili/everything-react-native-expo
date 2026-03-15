'use strict';

(function () {
  var ContextPanel = {
    stats: { saved_pct: 0, saved_bytes: 0, events: 0 },
    timeline: [],
    maxTimeline: 50,

    updateStats: function (data) {
      this.stats = data;
      this.renderStats();
    },

    addTimelineEvent: function (data) {
      this.timeline.unshift(data);
      if (this.timeline.length > this.maxTimeline) this.timeline.pop();
      this.renderTimeline();
    },

    renderStats: function () {
      var el = document.getElementById('context-stats');
      if (!el) return;
      el.style.display = '';
      var pct = Math.round(this.stats.context_saved_pct || this.stats.saved_pct || 0);
      var saved = this.stats.context_saved_bytes || this.stats.saved_bytes || 0;
      var events = this.stats.events_total || this.stats.events || 0;
      var kb = Math.round(saved / 1024);
      var barWidth = Math.min(pct, 100);
      el.innerHTML =
        '<h3>Context Savings</h3>' +
        '<div class="ctx-pct">' + pct + '%</div>' +
        '<div class="ctx-bar"><div class="ctx-bar-fill" style="width:' + barWidth + '%"></div></div>' +
        '<div class="ctx-details">' +
        '<span>' + kb + 'KB saved</span>' +
        '<span>' + events + ' events</span>' +
        '</div>';
    },

    renderTimeline: function () {
      var el = document.getElementById('context-timeline');
      if (!el) return;
      if (this.timeline.length === 0) return;
      el.style.display = '';
      var html = '<h3>Session Timeline</h3>';
      for (var i = 0; i < this.timeline.length; i++) {
        var e = this.timeline[i];
        html += '<div class="ctx-event">' + e.time + ' ' + e.icon + ' ' + e.text + '</div>';
      }
      el.innerHTML = html;
    }
  };

  window.contextPanel = ContextPanel;
})();
