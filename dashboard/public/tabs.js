(function () {
  'use strict';

  var TAB_NAMES = ['hq', 'myapp', 'ecosystem', 'insights'];
  var TAB_LABELS = { hq: 'HQ', myapp: 'My App', ecosystem: 'Ecosystem', insights: 'Insights' };

  var active = 'hq';
  var tabs = {};
  var initialized = {};
  var headerEl = null;
  var tabContentEl = null;
  var canvasContainer = null;
  var badgeCounts = {};

  var TAB_ICONS = {
    hq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    myapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>',
    ecosystem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    insights: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
  };

  var navStatsEl = null;
  var connected = false;

  function init(container) {
    canvasContainer = document.getElementById('canvasContainer');
    tabContentEl = document.getElementById('tabContent');

    headerEl = document.createElement('div');
    headerEl.className = 'tab-header';

    // Left: logo + version
    var leftGroup = document.createElement('div');
    leftGroup.className = 'tab-left';
    var logo = document.createElement('div');
    logo.className = 'tab-logo';
    logo.textContent = 'ERNE';
    leftGroup.appendChild(logo);
    var ver = document.createElement('span');
    ver.className = 'tab-version';
    ver.textContent = 'v0.7.0';
    leftGroup.appendChild(ver);
    headerEl.appendChild(leftGroup);

    // Center: tab buttons
    var tabBar = document.createElement('div');
    tabBar.className = 'tab-bar';

    TAB_NAMES.forEach(function (name) {
      var btn = document.createElement('button');
      btn.className = 'tab-btn' + (name === active ? ' active' : '');
      btn.dataset.tab = name;
      btn.innerHTML = '<span class="tab-icon">' + TAB_ICONS[name] + '</span>' + TAB_LABELS[name];
      btn.addEventListener('click', function () { switchTo(name); });
      tabBar.appendChild(btn);
    });

    headerEl.appendChild(tabBar);

    // Right: nav stats
    navStatsEl = document.createElement('div');
    navStatsEl.className = 'nav-stats';
    navStatsEl.innerHTML =
      '<span class="nav-conn" id="navConn" title="Disconnected"></span>' +
      '<span class="nav-stat" id="navWorking" title="Working agents">0</span>' +
      '<span class="nav-stat-sep">/</span>' +
      '<span class="nav-stat dim" id="navTotal" title="Total agents">0</span>' +
      '<span class="nav-timer" id="navTimer">0:00</span>';
    headerEl.appendChild(navStatsEl);

    container.insertBefore(headerEl, container.firstChild);

    // Session timer
    var sessionStart = Date.now();
    setInterval(function () {
      var elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      var m = Math.floor(elapsed / 60);
      var s = elapsed % 60;
      var el = document.getElementById('navTimer');
      if (el) el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      var idx = parseInt(e.key, 10);
      if (idx >= 1 && idx <= 4) switchTo(TAB_NAMES[idx - 1]);
    });
  }

  function switchTo(name) {
    if (TAB_NAMES.indexOf(name) === -1) return false;
    if (name === active) return false;

    var prev = active;
    active = name;

    var btns = headerEl.querySelectorAll('.tab-btn');
    btns.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === name);
    });

    // Hide previous tab's container
    if (prev !== 'hq' && tabs[prev]) {
      tabs[prev].deactivate();
      var prevContainer = tabContentEl.querySelector('[data-tab-panel="' + prev + '"]');
      if (prevContainer) prevContainer.style.display = 'none';
    }

    if (name === 'hq') {
      canvasContainer.style.display = '';
      tabContentEl.style.display = 'none';
      if (window.Panel && Panel.expand) Panel.expand();
    } else {
      canvasContainer.style.display = 'none';
      tabContentEl.style.display = '';
      if (window.Panel && Panel.collapse) Panel.collapse();

      if (!initialized[name] && tabs[name]) {
        // Create a wrapper div for this tab's content
        var wrapper = document.createElement('div');
        wrapper.dataset.tabPanel = name;
        wrapper.style.height = '100%';
        tabContentEl.appendChild(wrapper);
        tabs[name].init(wrapper);
        initialized[name] = true;
      }
      // Show this tab's container
      var panel = tabContentEl.querySelector('[data-tab-panel="' + name + '"]');
      if (panel) panel.style.display = '';
      if (tabs[name]) tabs[name].activate();
    }
    setBadge(name, 0);
    return true;
  }

  function registerTab(name, module) { tabs[name] = module; }
  function getActive() { return active; }

  function setBadge(name, count) {
    badgeCounts[name] = count;
    if (!headerEl) return;
    var btn = headerEl.querySelector('[data-tab="' + name + '"]');
    if (!btn) return;
    var badge = btn.querySelector('.tab-badge');
    if (count > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'tab-badge'; btn.appendChild(badge); }
      badge.textContent = count;
    } else if (badge) { badge.remove(); }
  }

  function updateNavStats(agents) {
    if (!navStatsEl) return;
    var working = 0;
    var total = 0;
    for (var name in agents) {
      if (!agents.hasOwnProperty(name)) continue;
      total++;
      var st = agents[name].status;
      if (st === 'working' || st === 'planning') working++;
    }
    var wEl = document.getElementById('navWorking');
    var tEl = document.getElementById('navTotal');
    if (wEl) {
      wEl.textContent = working;
      wEl.className = 'nav-stat' + (working > 0 ? ' active' : '');
    }
    if (tEl) tEl.textContent = total || '0';
  }

  function setNavConnected(isConnected) {
    connected = isConnected;
    var dot = document.getElementById('navConn');
    if (dot) {
      dot.className = 'nav-conn' + (isConnected ? ' on' : '');
      dot.title = isConnected ? 'Connected' : 'Disconnected';
    }
  }

  window.Tabs = { init: init, switchTo: switchTo, registerTab: registerTab, getActive: getActive, setBadge: setBadge, updateNavStats: updateNavStats, setNavConnected: setNavConnected };
})();
