'use strict';

(function () {
  var KnowledgeBrowser = {
    entries: [],
    filter: 'all',

    load: function () {
      fetch('/api/context/knowledge')
        .then(function (res) {
          if (!res.ok) throw new Error('not available');
          return res.json();
        })
        .then(function (data) {
          if (data.error || !Array.isArray(data)) return;
          KnowledgeBrowser.entries = data;
          KnowledgeBrowser.render();
        })
        .catch(function () {});
    },

    search: function (query) {
      fetch('/api/context/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          KnowledgeBrowser.entries = data.items || [];
          KnowledgeBrowser.render();
        })
        .catch(function () {});
    },

    render: function () {
      var el = document.getElementById('knowledge-browser');
      if (!el) return;
      if (this.entries.length === 0) return;
      el.style.display = '';
      var filtered = this.filter === 'all' ? this.entries : this.entries.filter(function (e) { return e.category === KnowledgeBrowser.filter; });
      var cats = ['all', 'pattern', 'decision', 'error', 'api', 'component'];
      var catHtml = cats.map(function (c) {
        return '<button class="ctx-cat ' + (KnowledgeBrowser.filter === c ? 'active' : '') + '" data-cat="' + c + '">' + c + '</button>';
      }).join('');
      var entriesHtml = filtered.map(function (e) {
        return '<div class="ctx-entry">' +
          '<span class="ctx-entry-cat">' + (e.category || '') + '</span>' +
          '<span class="ctx-entry-title">' + (e.title || '') + '</span>' +
          '<span class="ctx-entry-score">' + (e.score || e.relevance_score || 0).toFixed(2) + '</span>' +
          '</div>';
      }).join('');
      el.innerHTML = '<h3>Knowledge Base</h3>' +
        '<input type="text" id="kb-search" placeholder="Search..." class="ctx-input" />' +
        '<div class="ctx-categories">' + catHtml + '</div>' +
        '<div class="ctx-entries">' + entriesHtml + '</div>';

      var searchInput = document.getElementById('kb-search');
      if (searchInput) {
        searchInput.addEventListener('input', function (e) {
          if (e.target.value.length > 2) KnowledgeBrowser.search(e.target.value);
          else KnowledgeBrowser.load();
        });
      }
      var catBtns = document.querySelectorAll('.ctx-cat');
      catBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          KnowledgeBrowser.filter = btn.getAttribute('data-cat');
          KnowledgeBrowser.render();
        });
      });
    }
  };

  window.knowledgeBrowser = KnowledgeBrowser;
  document.addEventListener('DOMContentLoaded', function () { KnowledgeBrowser.load(); });
})();
