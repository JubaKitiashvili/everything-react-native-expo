'use strict';

/**
 * Agent definitions with priority and keyword triggers.
 * Higher priority wins when multiple agents match.
 */
const AGENTS = [
  {
    name: 'performance-profiler',
    priority: 10,
    keywords: ['perf', 'slow', 'fps', 'jank', 'memory', 'lag', 'freeze', 'stutter', 'bundle size', 'memory leak', 'frame drop', 'battery drain', 'cpu usage', 'tti', 'startup time'],
  },
  {
    name: 'expo-config-resolver',
    priority: 10,
    keywords: ['build', 'crash', 'metro', 'config', 'pod install', 'gradle', 'xcode', "won't start", 'build error', 'build failed', 'module not found', 'red screen', 'white screen', 'blank screen', 'eas build', 'prebuild', 'app.json', 'app.config'],
  },
  {
    name: 'native-bridge-builder',
    priority: 10,
    keywords: ['native', 'swift', 'kotlin', 'bridge', 'turbo module', 'jsi', 'fabric', 'native module', 'expo module', 'objective-c', 'codegen', 'nitro'],
  },
  {
    name: 'upgrade-assistant',
    priority: 10,
    keywords: ['upgrade', 'migration', 'breaking', 'expo sdk', 'react native version', 'deprecated', 'breaking change', 'peer dependency', 'outdated'],
  },
  {
    name: 'documentation-generator',
    priority: 10,
    keywords: ['docs', 'documentation', 'write docs', 'readme', 'jsdoc', 'api docs'],
  },
  {
    name: 'tdd-guide',
    priority: 8,
    keywords: ['test', 'tdd', 'coverage', 'jest', 'detox', 'failing test', 'unit test', 'snapshot test', 'integration test', 'e2e', 'mock', 'fixture'],
  },
  {
    name: 'code-reviewer',
    priority: 8,
    keywords: ['review', 'refactor', 'quality', 'tech debt', 'dead code', 'clean up', 'code smell', 'anti-pattern', 'readability', 'maintainability', 'dry', 'solid'],
  },
  {
    name: 'visual-debugger',
    priority: 5,
    keywords: ['visual', 'ui bug', 'layout', 'spacing', 'alignment', 'overflow', 'cut off', 'overlapping', 'not centered', 'wrong font', 'wrong colors', 'dark mode', 'safe area', 'image'],
  },
  {
    name: 'ui-designer',
    priority: 5,
    keywords: ['component', 'button', 'modal', 'screen', 'animation', 'design system', 'theme', 'icon', 'gesture', 'bottom sheet', 'drawer', 'header', 'card', 'skeleton', 'loading', 'toast', 'tab'],
  },
  {
    name: 'architect',
    priority: 5,
    keywords: ['architecture', 'design', 'plan', 'data flow', 'structure', 'system design', 'folder structure', 'state management', 'navigation structure', 'decompose', 'separation of concerns'],
  },
  {
    name: 'senior-developer',
    priority: 3,
    keywords: [],
  },
  {
    name: 'feature-builder',
    priority: 1,
    keywords: [],
  },
];

const FALLBACK_AGENT = 'feature-builder';

/**
 * Combine ticket title, description, and labels into a single searchable string.
 */
function buildSearchText(ticket) {
  const parts = [];
  if (ticket.title) parts.push(ticket.title);
  if (ticket.description) parts.push(ticket.description);
  if (Array.isArray(ticket.labels)) {
    parts.push(ticket.labels.join(' '));
  }
  return parts.join(' ').toLowerCase();
}

/**
 * Score a single agent against the search text.
 * Returns the number of keyword matches multiplied by the agent's priority.
 */
function scoreAgent(agent, searchText) {
  if (agent.keywords.length === 0) return 0;

  let matches = 0;
  for (const keyword of agent.keywords) {
    if (searchText.includes(keyword)) {
      matches++;
    }
  }

  return matches * agent.priority;
}

/**
 * Apply bonus scoring from audit data.
 * If the ticket mentions a file found in deadCode or high-severity findings,
 * boost the code-reviewer score.
 */
function applyAuditBonus(scores, ticket, auditData) {
  if (!auditData) return;

  const searchText = buildSearchText(ticket);

  // Check dead code references
  if (Array.isArray(auditData.deadCode)) {
    for (const entry of auditData.deadCode) {
      const file = typeof entry === 'string' ? entry : (entry.file || '');
      if (file && searchText.includes(file.toLowerCase())) {
        scores['code-reviewer'] = (scores['code-reviewer'] || 0) + 10;
        break;
      }
    }
  }

  // Check high-severity findings
  if (Array.isArray(auditData.findings)) {
    for (const finding of auditData.findings) {
      const severity = finding.severity || '';
      const file = finding.file || '';
      if (severity === 'high' && file && searchText.includes(file.toLowerCase())) {
        scores['code-reviewer'] = (scores['code-reviewer'] || 0) + 10;
        break;
      }
    }
  }
}

/**
 * Route a ticket to the best-matching ERNE agent.
 *
 * @param {object} ticket - { title, description, labels[], type }
 * @param {object} [auditData] - Parsed audit-data.json (deadCode[], findings[])
 * @param {object} [config] - Worker config (unused for now, reserved for overrides)
 * @returns {string} The agent name to handle this ticket
 */
function routeTicketToAgent(ticket, auditData, config) {
  if (!ticket || typeof ticket !== 'object') return FALLBACK_AGENT;

  const searchText = buildSearchText(ticket);

  // Senior-developer triggers on task type
  const isSeniorType = ticket.type === 'advice' || ticket.type === 'opinion' || ticket.type === 'question';

  // Score each agent
  const scores = {};
  for (const agent of AGENTS) {
    const score = scoreAgent(agent, searchText);
    if (score > 0) {
      scores[agent.name] = score;
    }
  }

  // Senior-developer type bonus
  if (isSeniorType) {
    scores['senior-developer'] = (scores['senior-developer'] || 0) + 3;
  }

  // Audit data bonuses
  applyAuditBonus(scores, ticket, auditData);

  // Find the winner
  let bestAgent = FALLBACK_AGENT;
  let bestScore = 0;

  for (const [name, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestAgent = name;
    }
  }

  return bestAgent;
}

module.exports = { routeTicketToAgent };
