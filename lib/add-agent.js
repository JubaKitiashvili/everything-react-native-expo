// lib/add-agent.js — Create a new custom ERNE agent definition
'use strict';

const fs = require('fs');
const path = require('path');

const VALID_ROOMS = ['development', 'code-review', 'testing', 'conference'];
const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function toTitleCase(kebab) {
  return kebab
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parseArgs(argv) {
  const args = argv.slice(3); // skip node, cli.js, add-agent
  let name = null;
  let room = 'development';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--room' && args[i + 1]) {
      room = args[i + 1];
      i++;
    } else if (!args[i].startsWith('-')) {
      name = args[i];
    }
  }

  return { name, room };
}

function generateTemplate(name, room) {
  const title = toTitleCase(name);
  return `---
name: ${name}
room: ${room}
description: Custom ERNE agent. Update this description with the agent's specialty and trigger commands.
---

You are the ERNE ${title} agent — a specialist for your React Native/Expo project.

## Your Role

[Describe what this agent does — its primary purpose and when it should be invoked.]

## Capabilities

- **[Capability 1]**: [Describe what this agent can do]
- **[Capability 2]**: [Describe another area of expertise]
- **[Capability 3]**: [Add more as needed]

## Process

1. **Understand the requirement** — Read the task context, ask clarifying questions if needed
2. **Analyze the codebase** — Check relevant files, patterns, and constraints
3. **Execute** — [Describe the agent's core workflow step]
4. **Verify** — Validate output against project standards and guidelines

## Guidelines

- Follow project coding standards from CLAUDE.md
- Functional components with \`const\` + arrow functions, named exports only
- Group imports: react -> react-native -> expo -> external -> internal -> types
- Max 250 lines per component — extract hooks and subcomponents when larger
- [Add agent-specific guidelines here]

## Output Format

\`\`\`markdown
## [Task Name]

### Summary
[1-2 sentence summary of what was done]

### Changes
- [File path] — [What changed and why]

### Notes
- [Any follow-up items or trade-offs]
\`\`\`
`;
}

async function addAgent(argv) {
  const { name, room } = parseArgs(argv || process.argv);

  // Validate name is provided
  if (!name) {
    console.error('Error: Agent name is required.');
    console.error('Usage: erne add-agent <name> [--room <room>]');
    process.exit(1);
  }

  // Validate kebab-case
  if (!KEBAB_CASE_RE.test(name)) {
    console.error(`Error: Agent name must be kebab-case (lowercase letters, numbers, hyphens).`);
    console.error(`  Got: "${name}"`);
    console.error(`  Example: erne add-agent my-custom-agent`);
    process.exit(1);
  }

  // Validate room
  if (!VALID_ROOMS.includes(room)) {
    console.error(`Error: Invalid room "${room}".`);
    console.error(`  Valid rooms: ${VALID_ROOMS.join(', ')}`);
    process.exit(1);
  }

  // Determine agents directory (relative to project root)
  const agentsDir = path.join(process.cwd(), '.claude', 'agents');
  const filePath = path.join(agentsDir, `${name}.md`);

  // Check for duplicates
  if (fs.existsSync(filePath)) {
    console.error(`Error: Agent "${name}" already exists at ${filePath}`);
    process.exit(1);
  }

  // Ensure agents directory exists
  fs.mkdirSync(agentsDir, { recursive: true });

  // Write template
  const template = generateTemplate(name, room);
  fs.writeFileSync(filePath, template, 'utf8');

  const title = toTitleCase(name);
  console.log(`\n  Agent created: .claude/agents/${name}.md`);
  console.log(`\n  Next steps:`);
  console.log(`    1. Edit .claude/agents/${name}.md to define the agent's specialty`);
  console.log(`    2. Update the description in the frontmatter`);
  console.log(`    3. Add specific capabilities and guidelines`);
  console.log(`    4. Reference it in your CLAUDE.md or hook configuration\n`);
}

module.exports = addAgent;
module.exports.addAgent = addAgent;
module.exports.generateTemplate = generateTemplate;
module.exports.parseArgs = parseArgs;
module.exports.VALID_ROOMS = VALID_ROOMS;
module.exports.KEBAB_CASE_RE = KEBAB_CASE_RE;
