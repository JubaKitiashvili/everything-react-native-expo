// dashboard/public/upgrades-tab.js
(function () {
  'use strict';

  var container = null;
  var listEl = null;
  var headerEl = null;
  var packages = [];

  var BUMP_COLORS = { major: 'red', minor: 'orange', patch: 'green' };

  function init(tabContent) {
    container = document.createElement('div');
    container.className = 'upg-container';

    headerEl = document.createElement('div');
    headerEl.className = 'upg-header';
    container.appendChild(headerEl);

    listEl = document.createElement('div');
    listEl.className = 'upg-list';
    container.appendChild(listEl);

    tabContent.appendChild(container);
  }

  function activate() {
    listEl.innerHTML = '<div class="eco-loading"><div class="eco-skeleton"></div><div class="eco-skeleton"></div><div class="eco-skeleton"></div></div>';
    fetch('/api/upgrades/scan')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        packages = data.packages || [];
        renderHeader(data);
        renderList();
        if (data.stale) {
          var banner = document.createElement('div');
          banner.className = 'eco-banner yellow';
          banner.textContent = 'Refreshing scan data...';
          container.insertBefore(banner, listEl);
          setTimeout(function () { banner.remove(); activate(); }, 10000);
        }
      })
      .catch(function () {
        listEl.innerHTML = '<div class="eco-error">Could not load upgrade data.</div>';
      });
  }

  function deactivate() {}

  function renderHeader(data) {
    var count = packages.length;
    headerEl.innerHTML =
      '<div class="upg-title">' + count + ' update' + (count !== 1 ? 's' : '') + ' available</div>' +
      '<div class="upg-actions">' +
        '<button class="eco-refresh-btn" id="upg-refresh">Refresh</button>' +
      '</div>';
    document.getElementById('upg-refresh').addEventListener('click', function () {
      this.textContent = 'Scanning...';
      this.disabled = true;
      fetch('/api/upgrades/refresh', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (data) { packages = data.packages || []; renderHeader(data); renderList(); })
        .catch(function () {});
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    if (packages.length === 0) {
      listEl.innerHTML = '<div class="eco-empty">All dependencies are up to date!</div>';
      return;
    }

    // Group by bump type
    var groups = { major: [], minor: [], patch: [] };
    packages.forEach(function (pkg) {
      if (groups[pkg.bump]) groups[pkg.bump].push(pkg);
      else groups.patch.push(pkg);
    });

    ['major', 'minor', 'patch'].forEach(function (bump) {
      if (groups[bump].length === 0) return;
      var section = document.createElement('div');
      section.className = 'upg-section';
      section.innerHTML = '<div class="upg-section-header ' + bump + '">' +
        bump.toUpperCase() + ' (' + groups[bump].length + ')</div>';

      groups[bump].forEach(function (pkg) {
        var row = document.createElement('div');
        row.className = 'upg-row';
        row.innerHTML =
          '<div class="upg-name">' + escapeHtml(pkg.name) + '</div>' +
          '<div class="upg-version">' + escapeHtml(pkg.current) + ' → ' + escapeHtml(pkg.latest) + '</div>' +
          '<div class="upg-bump ' + BUMP_COLORS[pkg.bump] + '">' + pkg.bump + '</div>' +
          '<div class="upg-risk">' + renderRiskDots(pkg.risk) + '</div>' +
          '<div class="upg-action">' + renderActionButton(pkg) + '</div>';

        var actionBtn = row.querySelector('.upg-action button');
        if (actionBtn) {
          actionBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (pkg.risk <= 2) doUpdate(pkg, actionBtn);
            else doPlan(pkg, actionBtn);
          });
        }

        // Expand for plan
        row.addEventListener('click', function () { togglePlanView(pkg, row); });
        section.appendChild(row);
      });

      listEl.appendChild(section);
    });
  }

  function renderRiskDots(risk) {
    var dots = '';
    for (var i = 1; i <= 5; i++) {
      dots += i <= risk ? '●' : '○';
    }
    return '<span class="upg-dots risk-' + risk + '">' + dots + '</span>';
  }

  function renderActionButton(pkg) {
    if (pkg.risk <= 2) {
      return '<button class="upg-btn update">Update Now</button>';
    }
    return '<button class="upg-btn plan">Plan Upgrade</button>';
  }

  function doUpdate(pkg, btn) {
    btn.textContent = 'Updating...';
    btn.disabled = true;
    fetch('/api/upgrades/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg.name, version: pkg.latest }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success) {
        btn.textContent = 'Done!';
        btn.className = 'upg-btn done';
        setTimeout(activate, 2000);
      } else {
        btn.textContent = 'Failed';
        btn.disabled = false;
      }
    })
    .catch(function () { btn.textContent = 'Error'; btn.disabled = false; });
  }

  function doPlan(pkg, btn) {
    btn.textContent = 'Planning...';
    btn.disabled = true;
    fetch('/api/upgrades/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg.name, from: pkg.current, to: pkg.latest }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.status === 'queued') {
        btn.textContent = 'Queued';
        btn.title = data.message;
      } else {
        btn.textContent = 'Agent Working...';
      }
    })
    .catch(function () { btn.textContent = 'Error'; btn.disabled = false; });
  }

  function togglePlanView(pkg, row) {
    var existing = row.querySelector('.upg-plan');
    if (existing) { existing.remove(); return; }

    fetch('/api/upgrades/plan/' + encodeURIComponent(pkg.name))
      .then(function (r) { if (r.status === 404) throw 'no plan'; return r.json(); })
      .then(function (plan) {
        var planEl = document.createElement('div');
        planEl.className = 'upg-plan';
        planEl.innerHTML = '<h4>Migration Plan: ' + escapeHtml(pkg.name) + ' ' + escapeHtml(pkg.current) + ' → ' + escapeHtml(pkg.latest) + '</h4>';
        if (plan.steps) {
          var ol = document.createElement('ol');
          plan.steps.forEach(function (step) {
            var li = document.createElement('li');
            li.textContent = step;
            ol.appendChild(li);
          });
          planEl.appendChild(ol);
        }
        row.appendChild(planEl);
      })
      .catch(function () {});
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  Tabs.registerTab('upgrades', { init: init, activate: activate, deactivate: deactivate });
})();
