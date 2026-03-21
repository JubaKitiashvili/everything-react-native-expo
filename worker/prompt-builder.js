'use strict';

const DESCRIPTION_MAX_LENGTH = 4000;

/**
 * Agent role descriptions for prompt context.
 */
const AGENT_ROLES = {
  'performance-profiler': 'You are a React Native performance specialist. Diagnose and fix performance issues including re-renders, memory leaks, slow lists, and animation jank.',
  'expo-config-resolver': 'You are an Expo/React Native build and config specialist. Resolve build errors, metro issues, native module linking, and configuration problems.',
  'native-bridge-builder': 'You are a native module specialist. Build and debug native bridges, Turbo Modules, Expo Modules, and JSI bindings across Swift, Kotlin, and C++.',
  'upgrade-assistant': 'You are a migration specialist. Handle React Native and Expo SDK upgrades, resolve breaking changes, and update deprecated APIs.',
  'documentation-generator': 'You are a documentation specialist. Generate clear, comprehensive docs for components, APIs, hooks, and architecture.',
  'tdd-guide': 'You are a testing specialist. Write and fix tests using Jest, React Native Testing Library, and Detox following TDD best practices.',
  'code-reviewer': 'You are a senior code reviewer. Identify code smells, dead code, anti-patterns, and tech debt. Suggest clean, maintainable solutions.',
  'visual-debugger': 'You are a UI/visual debugging specialist. Fix layout issues, spacing problems, alignment bugs, and visual inconsistencies.',
  'ui-designer': 'You are a React Native UI specialist. Build polished components, design systems, animations, and responsive layouts.',
  'architect': 'You are a software architect. Design scalable app architecture, data flows, navigation structures, and state management patterns.',
  'senior-developer': 'You are a senior React Native developer. Provide expert advice, evaluate tradeoffs, and guide technical decisions.',
  'feature-builder': 'You are a React Native feature developer. Implement features end-to-end with clean code, proper types, and test coverage.',
  'pipeline-orchestrator': 'You are a CI/CD and deployment specialist. Configure EAS builds, app store submissions, OTA updates, and release pipelines.',
};

/**
 * Truncate a string to maxLength, appending "..." if truncated.
 */
function truncate(str, maxLength) {
  if (!str || str.length <= maxLength) return str || '';
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Format a list of files as a markdown bullet list.
 */
function formatFileList(files) {
  if (!files || files.length === 0) return '';
  return files.map((f) => `- \`${f}\``).join('\n');
}

/**
 * Format screen context entries.
 */
function formatScreens(screens) {
  if (!screens || screens.length === 0) return '';
  return screens.map((s) => `- ${s.name}${s.file ? ` (\`${s.file}\`)` : ''}`).join('\n');
}

/**
 * Build the main execution prompt for a ticket.
 *
 * @param {object} ticket - { id, title, description, labels[], url }
 * @param {string} agent - Agent name
 * @param {object} context - From resolveContext: { files[], components[], hooks[], stores[], apis[], screens[] }
 * @param {object} [stackInfo] - { framework, language, navigation, state, testing, styling }
 * @param {object} [auditMeta] - { totalFiles, totalComponents, lastAudit }
 * @returns {string} The formatted prompt
 */
function buildPrompt(ticket, agent, context, stackInfo, auditMeta) {
  const sections = [];

  // Task header
  const id = ticket && ticket.id ? ticket.id : 'unknown';
  const title = ticket && ticket.title ? ticket.title : 'Untitled';
  sections.push(`# Task: ${title}\n**Ticket:** ${id}${ticket && ticket.url ? ` (${ticket.url})` : ''}`);

  // Description
  if (ticket && ticket.description) {
    const desc = truncate(ticket.description, DESCRIPTION_MAX_LENGTH);
    sections.push(`## Description\n${desc}`);
  }

  // Agent role
  const role = AGENT_ROLES[agent] || AGENT_ROLES['feature-builder'];
  sections.push(`## Your Role\n${role}`);

  // Stack info
  if (stackInfo && typeof stackInfo === 'object') {
    const lines = [];
    if (stackInfo.framework) lines.push(`- **Framework:** ${stackInfo.framework}`);
    if (stackInfo.language) lines.push(`- **Language:** ${stackInfo.language}`);
    if (stackInfo.navigation) lines.push(`- **Navigation:** ${stackInfo.navigation}`);
    if (stackInfo.state) lines.push(`- **State:** ${stackInfo.state}`);
    if (stackInfo.testing) lines.push(`- **Testing:** ${stackInfo.testing}`);
    if (stackInfo.styling) lines.push(`- **Styling:** ${stackInfo.styling}`);
    if (lines.length > 0) {
      sections.push(`## Stack\n${lines.join('\n')}`);
    }
  }

  // Relevant screens
  if (context && context.screens && context.screens.length > 0) {
    sections.push(`## Relevant Screens\n${formatScreens(context.screens)}`);
  }

  // Key files
  if (context && context.files && context.files.length > 0) {
    sections.push(`## Key Files\n${formatFileList(context.files)}`);
  }

  // Instructions
  sections.push(`## Instructions
- Follow the project's coding standards (functional components, named exports, TypeScript strict)
- Write clean, well-typed code
- Add tests for new functionality
- Use conventional commits: \`feat:\`, \`fix:\`, \`refactor:\`, \`test:\`, \`docs:\`, \`chore:\`
- Keep changes minimal and focused on the task`);

  return sections.join('\n\n');
}

/**
 * Build a review prompt for a diff.
 *
 * @param {string} diff - The git diff to review
 * @param {object} ticket - { id, title }
 * @param {string} agent - Agent name
 * @returns {string} The formatted review prompt
 */
function buildReviewPrompt(diff, ticket, agent) {
  const sections = [];

  const title = ticket && ticket.title ? ticket.title : 'Untitled';
  const role = AGENT_ROLES[agent] || AGENT_ROLES['code-reviewer'];

  sections.push(`# Code Review: ${title}`);
  sections.push(`## Your Role\n${role}`);
  sections.push(`## Review Instructions
- Check for bugs, edge cases, and logic errors
- Verify TypeScript types are correct and strict
- Look for performance issues (unnecessary re-renders, missing memoization)
- Check for security concerns (hardcoded secrets, unvalidated inputs)
- Ensure code follows project conventions
- Flag any missing tests`);

  if (diff) {
    const truncatedDiff = truncate(diff, DESCRIPTION_MAX_LENGTH);
    sections.push(`## Diff\n\`\`\`diff\n${truncatedDiff}\n\`\`\``);
  }

  return sections.join('\n\n');
}

/**
 * Build a fix prompt for issues found during review.
 *
 * @param {Array} issues - Array of { file, line, message, severity }
 * @param {object} ticket - { id, title }
 * @returns {string} The formatted fix prompt
 */
function buildFixPrompt(issues, ticket) {
  const sections = [];

  const title = ticket && ticket.title ? ticket.title : 'Untitled';

  sections.push(`# Fix Issues: ${title}`);
  sections.push(`## Your Role\n${AGENT_ROLES['code-reviewer']}`);

  if (Array.isArray(issues) && issues.length > 0) {
    const issueLines = issues.map((issue) => {
      const loc = issue.file ? `\`${issue.file}${issue.line ? `:${issue.line}` : ''}\`` : 'unknown';
      const severity = issue.severity ? `[${issue.severity.toUpperCase()}]` : '';
      return `- ${severity} ${loc}: ${issue.message || 'No description'}`;
    });
    sections.push(`## Issues to Fix\n${issueLines.join('\n')}`);
  }

  sections.push(`## Fix Instructions
- Address each issue listed above
- Do not introduce new issues
- Keep changes minimal — only fix what is flagged
- Run existing tests to verify nothing breaks
- Use conventional commits for each fix`);

  return sections.join('\n\n');
}

module.exports = { buildPrompt, buildReviewPrompt, buildFixPrompt };
