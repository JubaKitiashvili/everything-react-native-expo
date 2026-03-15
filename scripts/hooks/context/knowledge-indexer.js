'use strict';
const { readStdin } = require('../lib/hook-utils');
const { sendAsync } = require('../lib/context-client');

const input = readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name;
const toolOutput = input.tool_output || {};
const stdout = toolOutput.stdout || toolOutput.content || '';

// Extract decisions from agent output
const decisionMatch = stdout.match(/(?:chose|decided|selected|using)\s+(.+?)\s+(?:because|since|for|over)\s+(.+?)(?:\.|$)/i);
if (decisionMatch) {
  sendAsync('knowledge', {
    category: 'decision',
    title: decisionMatch[1].slice(0, 100),
    content: `${decisionMatch[1]}: ${decisionMatch[2]}`,
    source: toolName,
    tags: 'auto-indexed'
  });
}

// Extract error patterns from Bash failures
if (toolName === 'Bash' && toolOutput.exit_code && toolOutput.exit_code !== 0) {
  const stderr = (toolOutput.stderr || '').slice(0, 500);
  if (stderr.length > 20) {
    sendAsync('knowledge', {
      category: 'error',
      title: `Error: ${stderr.split('\n')[0].slice(0, 80)}`,
      content: stderr,
      source: input.tool_input?.command?.slice(0, 100) || 'bash',
      tags: 'auto-indexed,error'
    });
  }
}
