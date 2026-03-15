(function () {
  'use strict';

  var container = null;
  var feedEl = null;
  var sidebarEl = null;
  var filterEl = null;
  var currentFilter = 'all';
  var feedData = [];

  var FILTERS = ['all', 'updates', 'trending', 'tips', 'security'];
  var FILTER_MAP = { all: null, updates: ['NEW', 'BREAK'], trending: ['HOT'], tips: ['TIP'], security: ['SEC'] };
  var TAG_COLORS = { NEW: 'green', SEC: 'red', HOT: 'blue', TIP: 'orange', BREAK: 'red' };

  function init(tabContent) {
    container = document.createElement('div');
    container.className = 'eco-container';

    filterEl = document.createElement('div');
    filterEl.className = 'eco-filters';
    FILTERS.forEach(function (f) {
      var btn = document.createElement('button');
      btn.className = 'eco-filter-btn' + (f === 'all' ? ' active' : '');
      btn.textContent = f.charAt(0).toUpperCase() + f.slice(1);
      btn.addEventListener('click', function () { setFilter(f); });
      filterEl.appendChild(btn);
    });
    var refreshBtn = document.createElement('button');
    refreshBtn.className = 'eco-refresh-btn';
    refreshBtn.textContent = 'Refresh';
    refreshBtn.addEventListener('click', doRefresh);
    filterEl.appendChild(refreshBtn);
    container.appendChild(filterEl);

    var layout = document.createElement('div');
    layout.className = 'eco-layout';
    feedEl = document.createElement('div');
    feedEl.className = 'eco-feed';
    layout.appendChild(feedEl);
    sidebarEl = document.createElement('div');
    sidebarEl.className = 'eco-sidebar';
    layout.appendChild(sidebarEl);
    container.appendChild(layout);
    tabContent.appendChild(container);
    showLoading();
  }

  function activate() {
    fetch('/api/ecosystem/feed').then(function (r) { return r.json(); }).then(function (data) {
      if (data.empty) { showEmpty(); doRefresh(); return; }
      feedData = data.items || [];
      renderFeed();
      renderSidebar(data);
      if (data.rateLimited) showBanner('GitHub API rate limit reached. Data will refresh automatically.', 'orange');
    }).catch(function () { showError(); });
  }

  function deactivate() {}

  function showLoading() {
    feedEl.innerHTML = '<div class="eco-loading">' + '<div class="eco-skeleton"></div>'.repeat(4) + '</div>';
    sidebarEl.innerHTML = '<div class="eco-sidebar-loading">Detecting stack...</div>';
  }

  function showEmpty() { feedEl.innerHTML = '<div class="eco-empty">No ecosystem data yet. Fetching...</div>'; }

  function showError() {
    feedEl.innerHTML = '';
    var errDiv = document.createElement('div');
    errDiv.className = 'eco-error';
    var p = document.createElement('p');
    p.textContent = 'Could not fetch ecosystem data. Check your internet connection.';
    errDiv.appendChild(p);
    var retryBtn = document.createElement('button');
    retryBtn.className = 'eco-refresh-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', doRefresh);
    errDiv.appendChild(retryBtn);
    feedEl.appendChild(errDiv);
  }

  function showBanner(msg, color) {
    var banner = document.createElement('div');
    banner.className = 'eco-banner ' + (color || 'yellow');
    banner.textContent = msg;
    container.insertBefore(banner, container.children[1]);
    setTimeout(function () { banner.remove(); }, 15000);
  }

  function setFilter(f) {
    currentFilter = f;
    filterEl.querySelectorAll('.eco-filter-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.textContent.toLowerCase() === f);
    });
    renderFeed();
  }

  function renderFeed() {
    var tags = FILTER_MAP[currentFilter];
    var filtered = tags ? feedData.filter(function (item) { return tags.indexOf(item.tag) !== -1; }) : feedData;
    if (filtered.length === 0) { feedEl.innerHTML = '<div class="eco-empty">No items match this filter.</div>'; return; }
    feedEl.innerHTML = '';
    filtered.forEach(function (item) {
      var el = document.createElement('div');
      el.className = 'eco-item';
      var displayTitle = item.package ? escapeHtml(item.package) + '  ' + escapeHtml(item.title) : escapeHtml(item.title);
      el.innerHTML =
        '<div class="eco-item-header">' +
          '<span class="eco-tag ' + (TAG_COLORS[item.tag] || '') + '">' + escapeHtml(item.tag) + '</span>' +
          '<span class="eco-item-pkg">' + escapeHtml(item.package || '') + '</span>' +
          '<span class="eco-item-ver">' + escapeHtml(item.title) + '</span>' +
          '<span class="eco-item-time">' + formatTimeAgo(item.timestamp) + '</span>' +
        '</div>' +
        '<div class="eco-item-summary">' + escapeHtml(item.summary) + '</div>';
      if (item.url && /^https?:\/\//.test(item.url)) { el.style.cursor = 'pointer'; el.addEventListener('click', function () { window.open(item.url, '_blank', 'noopener'); }); }
      feedEl.appendChild(el);
    });
  }

  function renderSidebar(data) {
    sidebarEl.innerHTML = '';
    var stats = document.createElement('div');
    stats.className = 'eco-stats';
    var updates = feedData.filter(function (i) { return i.tag === 'NEW' || i.tag === 'BREAK'; }).length;
    var security = feedData.filter(function (i) { return i.tag === 'SEC'; }).length;
    stats.innerHTML = '<h4>Quick Stats</h4>' +
      '<div class="eco-stat"><span class="eco-stat-num green">' + updates + '</span> updates</div>' +
      '<div class="eco-stat"><span class="eco-stat-num red">' + security + '</span> security patches</div>';
    sidebarEl.appendChild(stats);
    if (data.lastFetched) {
      var info = document.createElement('div');
      info.className = 'eco-info';
      info.innerHTML = '<small>Last updated: ' + formatTimeAgo(data.lastFetched) + '</small>' +
        (data.ghToken ? '<br><small>GitHub: authenticated</small>' : '<br><small>GitHub: unauthenticated (60 req/hr)</small>');
      sidebarEl.appendChild(info);
    }
  }

  function doRefresh() {
    var btn = container.querySelector('.eco-refresh-btn');
    if (btn) { btn.textContent = 'Refreshing...'; btn.disabled = true; }
    fetch('/api/ecosystem/refresh', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (data) {
      feedData = data.items || [];
      renderFeed();
      renderSidebar(data);
      if (btn) { btn.textContent = 'Refresh'; btn.disabled = false; }
    }).catch(function () {
      showBanner('Refresh failed. Showing cached data.', 'yellow');
      if (btn) { btn.textContent = 'Refresh'; btn.disabled = false; }
    });
  }

  function escapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function formatTimeAgo(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  Tabs.registerTab('ecosystem', { init: init, activate: activate, deactivate: deactivate });
})();
