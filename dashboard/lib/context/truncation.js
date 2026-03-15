'use strict';
const crypto = require('node:crypto');

const MAX_PASSTHROUGH = 2048;
const HEAD_SIZE = 500;
const TAIL_SIZE = 500;

// T1: Structured — detect and summarize JSON
function truncateStructured(output) {
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      const sample = parsed.slice(0, 3);
      return JSON.stringify({ _truncated: true, total_items: parsed.length, sample, keys: parsed[0] ? Object.keys(parsed[0]) : [] });
    }
    // Object — keep top-level keys, truncate large values
    const summary = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && val.length > 100) summary[key] = val.slice(0, 100) + '...';
      else if (Array.isArray(val)) summary[key] = `[${val.length} items]`;
      else if (typeof val === 'object' && val !== null) summary[key] = `{${Object.keys(val).length} keys}`;
      else summary[key] = val;
    }
    return JSON.stringify(summary, null, 2);
  } catch {
    return null;
  }
}

// T2: Pattern — extract relevant parts from known output formats
const PATTERNS = [
  {
    // Test output (jest/vitest)
    detect: /Test Suites?:.*total|Tests:.*total|FAIL\s/,
    extract(output) {
      const lines = output.split('\n');
      const failures = lines.filter(l => /FAIL|●|Expected:|Received:|Error:|✕/.test(l));
      const summary = lines.filter(l => /Test Suites?:|Tests:|Time:|Snapshots:/.test(l));
      return [...failures.slice(0, 20), '', ...summary].join('\n');
    }
  },
  {
    // Git diff
    detect: /^diff --git|^\+\+\+|^---/m,
    extract(output) {
      const lines = output.split('\n');
      const headers = lines.filter(l => /^diff --git|^\+\+\+|^---|^@@|files? changed/.test(l));
      const stats = lines.filter(l => /\d+ files? changed|\d+ insertion|\d+ deletion/.test(l));
      return [...headers.slice(0, 30), '', ...stats].join('\n');
    }
  },
  {
    // npm install/build output
    detect: /added \d+ packages|npm warn|npm error|Successfully compiled/,
    extract(output) {
      const lines = output.split('\n');
      const relevant = lines.filter(l => /added|removed|npm warn|npm error|compiled|built|error|warning/i.test(l));
      return relevant.slice(0, 15).join('\n');
    }
  }
];

function truncatePattern(output) {
  for (const p of PATTERNS) {
    if (p.detect.test(output)) return p.extract(output);
  }
  return null;
}

// T3: Head/Tail
function truncateHeadTail(output) {
  const lines = output.split('\n');
  const head = output.slice(0, HEAD_SIZE);
  const tail = output.slice(-TAIL_SIZE);
  return `${head}\n\n... [${lines.length} lines, ${output.length} bytes total] ...\n\n${tail}`;
}

// T4: Hash
function truncateHash(output) {
  const hash = crypto.createHash('sha256').update(output).digest('hex');
  return JSON.stringify({ _binary: true, sha256: hash, size: output.length, type: 'binary' });
}

/**
 * Smart truncation — 4 tiers
 * @param {string} output - Raw tool output
 * @param {string} toolName - Which tool produced this (Read, Bash, Grep, Glob)
 * @param {object} opts - Options ({ isBinary })
 * @returns {string} Truncated output
 */
function truncate(output, toolName, opts = {}) {
  if (!output) return output;

  // T4: Binary content — always apply regardless of size
  if (opts.isBinary) return truncateHash(output);

  // T1: Structured (JSON) — always try; only use if shorter
  const structured = truncateStructured(output);
  if (structured && structured.length < output.length) return structured;

  // T2: Pattern matching — always try; only use if shorter
  const pattern = truncatePattern(output);
  if (pattern && pattern.length < output.length) return pattern;

  // Passthrough for small output that didn't match T1/T2
  if (output.length <= MAX_PASSTHROUGH) return output;

  // T3: Head/Tail fallback for large unstructured output
  return truncateHeadTail(output);
}

module.exports = { truncate, truncateStructured, truncatePattern, truncateHeadTail, truncateHash };
