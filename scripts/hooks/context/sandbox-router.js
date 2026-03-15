'use strict';
const { readStdin } = require('../lib/hook-utils');
const { sendSync } = require('../lib/context-client');

// Skip if inside a hook chain
if (process.env.ERNE_HOOK_CHAIN === 'true') process.exit(0);

const input = readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name;
const toolInput = input.tool_input || {};

const SANDBOXED_TOOLS = {
  Read: (args) => `cat -n "${args.file_path}"`,
  Bash: (args) => args.command,
  Grep: (args) => {
    const parts = ['rg'];
    if (args.pattern) parts.push(`"${args.pattern}"`);
    if (args.path) parts.push(args.path);
    if (args.glob) parts.push(`--glob "${args.glob}"`);
    return parts.join(' ');
  },
  Glob: (args) => `find . -name "${args.pattern}" -type f 2>/dev/null | head -50`
};

const builder = SANDBOXED_TOOLS[toolName];
if (!builder) process.exit(0); // not a sandboxed tool

const command = builder(toolInput);
// Output rewritten tool call to stdout
console.log(JSON.stringify({
  tool_name: 'mcp__erne_context__ctx_execute',
  tool_input: { command, original_tool: toolName }
}));
