(function () {
  'use strict';

  var TAB_NAMES = ['hq', 'ecosystem', 'upgrades', 'insights'];
  var TAB_LABELS = { hq: 'HQ', ecosystem: 'Ecosystem', upgrades: 'Upgrades', insights: 'Insights' };

  var active = 'hq';
  var tabs = {};
  var initialized = {};
  var headerEl = null;
  var tabContentEl = null;
  var canvasContainer = null;
  var badgeCounts = {};

  function init(container) {
    canvasContainer = document.getElementById('canvasContainer');
    tabContentEl = document.getElementById('tabContent');

    headerEl = document.createElement('div');
    headerEl.className = 'tab-header';

    var logo = document.createElement('div');
    logo.className = 'tab-logo';
    logo.textContent = 'ERNE';
    headerEl.appendChild(logo);

    var tabBar = document.createElement('div');
    tabBar.className = 'tab-bar';

    TAB_NAMES.forEach(function (name) {
      var btn = document.createElement('button');
      btn.className = 'tab-btn' + (name === active ? ' active' : '');
      btn.dataset.tab = name;
      btn.innerHTML = TAB_LABELS[name];
      btn.addEventListener('click', function () { switchTo(name); });
      tabBar.appendChild(btn);
    });

    headerEl.appendChild(tabBar);
    container.insertBefore(headerEl, container.firstChild);

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

    if (name === 'hq') {
      canvasContainer.style.display = '';
      tabContentEl.style.display = 'none';
      if (window.Panel && Panel.expand) Panel.expand();
    } else {
      canvasContainer.style.display = 'none';
      tabContentEl.style.display = '';
      if (window.Panel && Panel.collapse) Panel.collapse();

      if (!initialized[name] && tabs[name]) {
        tabs[name].init(tabContentEl);
        initialized[name] = true;
      }
      if (tabs[name]) tabs[name].activate();
    }

    if (prev !== 'hq' && tabs[prev]) tabs[prev].deactivate();
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

  window.Tabs = { init: init, switchTo: switchTo, registerTab: registerTab, getActive: getActive, setBadge: setBadge };
})();
