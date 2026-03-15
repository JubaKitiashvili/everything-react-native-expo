'use strict';
const { readStdin } = require('../lib/hook-utils');
const { sendSync } = require('../lib/context-client');

// Skip if inside a hook chain
if (process.env.ERNE_HOOK_CHAIN === 'true') process.exit(0);

const input = readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name;
const toolInput = input.tool_input || {};

// Error prevention — check for known warnings on file modifications
if (toolName === 'Edit' || toolName === 'Write') {
  const filePath = toolInput.file_path || toolInput.path || '';
  sendSync('search', { query: filePath, category: 'error', min_score: 0.7, limit: 2 }, 500)
    .then(result => {
      if (result && result.items && result.items.length > 0) {
        const warnings = result.items.map(w => `⚠️ ERNE: ${w.snippet}`).join('\n');
        console.error(warnings);
      }
    })
    .catch(() => {});
}

function shellEscape(str) {
  if (!str) return "''";
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

const SANDBOXED_TOOLS = {
  Read: (args) => `cat -n ${shellEscape(args.file_path)}`,
  Bash: (args) => args.command,
  Grep: (args) => {
    const parts = ['rg'];
    if (args.pattern) parts.push(shellEscape(args.pattern));
    if (args.path) parts.push(shellEscape(args.path));
    if (args.glob) parts.push('--glob', shellEscape(args.glob));
    return parts.join(' ');
  },
  Glob: (args) => `find . -name ${shellEscape(args.pattern)} -type f 2>/dev/null | head -50`
};

const builder = SANDBOXED_TOOLS[toolName];
if (!builder) process.exit(0); // not a sandboxed tool

const command = builder(toolInput);
// Output rewritten tool call to stdout
console.log(JSON.stringify({
  tool_name: 'mcp__erne_context__ctx_execute',
  tool_input: { command, original_tool: toolName }
}));
