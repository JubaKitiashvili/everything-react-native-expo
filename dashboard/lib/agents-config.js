'use strict';

/**
 * Canonical agent list — single source of truth for server + browser.
 * panel.js inlines a copy; server modules require() this file.
 */

const AGENT_DEFINITIONS = [
  { name: 'architect', room: 'development' },
  { name: 'native-bridge-builder', room: 'development' },
  { name: 'expo-config-resolver', room: 'development' },
  { name: 'ui-designer', room: 'development' },
  { name: 'code-reviewer', room: 'review' },
  { name: 'upgrade-assistant', room: 'review' },
  { name: 'tdd-guide', room: 'testing' },
  { name: 'performance-profiler', room: 'testing' },
  { name: 'senior-developer', room: 'development' },
  { name: 'feature-builder', room: 'development' },
  { name: 'pipeline-orchestrator', room: 'conference' },
];

const AGENT_ORDER = [
  'architect', 'senior-developer', 'feature-builder',
  'native-bridge-builder', 'expo-config-resolver', 'ui-designer',
  'code-reviewer', 'upgrade-assistant',
  'tdd-guide', 'performance-profiler',
  'pipeline-orchestrator',
];

module.exports = { AGENT_ORDER, AGENT_DEFINITIONS };
