'use strict';
const crypto = require('node:crypto');

const MAX_PASSTHROUGH = 2048;
const HEAD_SIZE = 500;
const TAIL_SIZE = 500;

// Aggressive mode limits (used when budget is throttled)
const AGGRESSIVE_PASSTHROUGH = 512;
const AGGRESSIVE_HEAD = 200;
const AGGRESSIVE_TAIL = 200;

// T1: Structured — detect and summarize JSON
function truncateStructured(output, aggressive) {
  try {
    const parsed = JSON.parse(output);
    const sampleSize = aggressive ? 1 : 3;
    const valSlice = aggressive ? 50 : 100;
    if (Array.isArray(parsed)) {
      const sample = parsed.slice(0, sampleSize);
      return JSON.stringify({ _truncated: true, total_items: parsed.length, sample, keys: parsed[0] ? Object.keys(parsed[0]) : [] });
    }
    // Object — keep top-level keys, truncate large values
    const summary = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string' && val.length > valSlice) summary[key] = val.slice(0, valSlice) + '...';
      else if (Array.isArray(val)) summary[key] = `[${val.length} items]`;
      else if (typeof val === 'object' && val !== null) summary[key] = `{${Object.keys(val).length} keys}`;
      else summary[key] = val;
    }
    return JSON.stringify(summary, null, aggressive ? 0 : 2);
  } catch {
    return null;
  }
}

// T2: Pattern — extract relevant parts from known output formats
const PATTERNS = [
  {
    // Test output (jest/vitest)
    name: 'test',
    detect: /Test Suites?:.*total|Tests:.*total|FAIL\s/,
    extract(output, aggressive) {
      const lines = output.split('\n');
      const maxFail = aggressive ? 5 : 20;
      const failures = lines.filter(l => /FAIL|●|Expected:|Received:|Error:|✕/.test(l));
      const summary = lines.filter(l => /Test Suites?:|Tests:|Time:|Snapshots:/.test(l));
      return [...failures.slice(0, maxFail), '', ...summary].join('\n');
    }
  },
  {
    // Git diff
    name: 'diff',
    detect: /^diff --git|^\+\+\+|^---/m,
    extract(output, aggressive) {
      const lines = output.split('\n');
      const maxHeaders = aggressive ? 10 : 30;
      const headers = lines.filter(l => /^diff --git|^\+\+\+|^---|^@@|files? changed/.test(l));
      const stats = lines.filter(l => /\d+ files? changed|\d+ insertion|\d+ deletion/.test(l));
      return [...headers.slice(0, maxHeaders), '', ...stats].join('\n');
    }
  },
  {
    // npm install/build output
    name: 'npm',
    detect: /added \d+ packages|npm warn|npm error|Successfully compiled/,
    extract(output, aggressive) {
      const lines = output.split('\n');
      const maxLines = aggressive ? 5 : 15;
      const relevant = lines.filter(l => /added|removed|npm warn|npm error|compiled|built|error|warning/i.test(l));
      return relevant.slice(0, maxLines).join('\n');
    }
  }
];

function truncatePattern(output, aggressive) {
  for (const p of PATTERNS) {
    if (p.detect.test(output)) return { result: p.extract(output, aggressive), patternName: p.name };
  }
  return null;
}

// T3: Head/Tail
function truncateHeadTail(output, aggressive) {
  const headSize = aggressive ? AGGRESSIVE_HEAD : HEAD_SIZE;
  const tailSize = aggressive ? AGGRESSIVE_TAIL : TAIL_SIZE;
  const lines = output.split('\n');
  const head = output.slice(0, headSize);
  const tail = output.slice(-tailSize);
  return `${head}\n\n... [${lines.length} lines, ${output.length} bytes total] ...\n\n${tail}`;
}

// T4: Hash
function truncateHash(output) {
  const hash = crypto.createHash('sha256').update(output).digest('hex');
  return JSON.stringify({ _binary: true, sha256: hash, size: output.length, type: 'binary' });
}

/**
 * Smart truncation — 4 tiers with metrics
 * @param {string} output - Raw tool output
 * @param {string} toolName - Which tool produced this (Read, Bash, Grep, Glob)
 * @param {object} opts - Options ({ isBinary, aggressive })
 * @returns {{ output: string, tier: string, originalBytes: number, truncatedBytes: number, savingsPct: number }}
 */
function truncate(output, toolName, opts = {}) {
  if (!output) return { output, tier: 'empty', originalBytes: 0, truncatedBytes: 0, savingsPct: 0 };

  const originalBytes = output.length;
  const aggressive = !!opts.aggressive;
  const passthrough = aggressive ? AGGRESSIVE_PASSTHROUGH : MAX_PASSTHROUGH;

  function result(truncated, tier) {
    const truncatedBytes = truncated.length;
    const savingsPct = originalBytes > 0 ? Math.round(((originalBytes - truncatedBytes) / originalBytes) * 100) : 0;
    return { output: truncated, tier, originalBytes, truncatedBytes, savingsPct };
  }

  // T4: Binary content — always apply regardless of size
  if (opts.isBinary) return result(truncateHash(output), 'T4_binary');

  // T1: Structured (JSON) — always try; only use if shorter
  const structured = truncateStructured(output, aggressive);
  if (structured && structured.length < output.length) return result(structured, 'T1_structured');

  // T2: Pattern matching — always try; only use if shorter
  const patternResult = truncatePattern(output, aggressive);
  if (patternResult && patternResult.result.length < output.length) {
    return result(patternResult.result, 'T2_' + patternResult.patternName);
  }

  // Passthrough for small output that didn't match T1/T2
  if (output.length <= passthrough) return result(output, 'passthrough');

  // T3: Head/Tail fallback for large unstructured output
  return result(truncateHeadTail(output, aggressive), 'T3_headtail');
}

// Legacy compat — returns string only (for existing callers)
function truncateString(output, toolName, opts = {}) {
  return truncate(output, toolName, opts).output;
}

module.exports = { truncate, truncateString, truncateStructured, truncatePattern, truncateHeadTail, truncateHash };
