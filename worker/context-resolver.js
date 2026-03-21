'use strict';

const DEFAULT_MAX_FILES = 10;

/**
 * Build a searchable string from a ticket's title and description.
 */
function buildSearchText(ticket) {
  const parts = [];
  if (ticket.title) parts.push(ticket.title);
  if (ticket.description) parts.push(ticket.description);
  return parts.join(' ');
}

/**
 * Case-insensitive check if text contains a name.
 */
function mentions(text, name) {
  if (!name || !text) return false;
  return text.toLowerCase().includes(name.toLowerCase());
}

/**
 * Match screens from audit data that are mentioned in the ticket.
 */
function matchScreens(auditData, searchText) {
  const matched = [];
  const screens = auditData.screens || auditData.routes || [];
  for (const screen of screens) {
    const name = screen.name || screen.component || '';
    const file = screen.file || screen.path || '';
    if (name && mentions(searchText, name)) {
      matched.push({ name, file });
    }
  }
  return matched;
}

/**
 * Match components from audit data that are mentioned in the ticket.
 */
function matchComponents(auditData, searchText) {
  const matched = [];
  const components = auditData.components || [];
  for (const comp of components) {
    const name = comp.name || '';
    const file = comp.file || comp.path || '';
    if (name && mentions(searchText, name)) {
      matched.push({ name, file });
    }
  }
  return matched;
}

/**
 * Match hooks from audit data that are mentioned in the ticket.
 */
function matchHooks(auditData, searchText) {
  const matched = [];
  const hooks = auditData.hooks || [];
  for (const hook of hooks) {
    const name = hook.name || '';
    const file = hook.file || hook.path || '';
    if (name && mentions(searchText, name)) {
      matched.push({ name, file });
    }
  }
  return matched;
}

/**
 * Match API endpoints from audit data that are mentioned in the ticket.
 */
function matchApis(auditData, searchText) {
  const matched = [];
  const apis = auditData.apis || auditData.endpoints || [];
  for (const api of apis) {
    const url = api.url || api.path || api.endpoint || '';
    if (url && mentions(searchText, url)) {
      matched.push({ url, file: api.file || '' });
    }
  }
  return matched;
}

/**
 * Match stores from audit data that are mentioned in the ticket.
 */
function matchStores(auditData, searchText) {
  const matched = [];
  const stores = auditData.stores || auditData.state || [];
  for (const store of stores) {
    const name = store.name || '';
    const file = store.file || store.path || '';
    if (name && mentions(searchText, name)) {
      matched.push({ name, file });
    }
  }
  return matched;
}

/**
 * Collect all unique file paths from matched items and limit to maxFiles.
 */
function collectFiles(matches, maxFiles) {
  const seen = new Set();
  const files = [];

  for (const item of matches) {
    const file = item.file || item.path || '';
    if (file && !seen.has(file)) {
      seen.add(file);
      files.push(file);
      if (files.length >= maxFiles) break;
    }
  }

  return files;
}

/**
 * Resolve relevant project context from audit data based on a ticket.
 *
 * @param {object} auditData - Parsed audit-data.json
 * @param {object} ticket - { title, description, labels[] }
 * @param {object} [config] - Worker config (config.erne.max_context_files)
 * @returns {object} { files[], components[], hooks[], stores[], apis[], screens[] }
 */
function resolveContext(auditData, ticket, config) {
  const empty = { files: [], components: [], hooks: [], stores: [], apis: [], screens: [] };

  if (!auditData || typeof auditData !== 'object') return empty;
  if (!ticket || typeof ticket !== 'object') return empty;

  const searchText = buildSearchText(ticket);
  if (!searchText) return empty;

  const maxFiles = (config && config.erne && config.erne.max_context_files) || DEFAULT_MAX_FILES;

  const screens = matchScreens(auditData, searchText);
  const components = matchComponents(auditData, searchText);
  const hooks = matchHooks(auditData, searchText);
  const apis = matchApis(auditData, searchText);
  const stores = matchStores(auditData, searchText);

  // Collect all matched items for file deduplication
  const allMatches = [...screens, ...components, ...hooks, ...apis, ...stores];
  const files = collectFiles(allMatches, maxFiles);

  return { files, components, hooks, stores, apis, screens };
}

module.exports = { resolveContext };
