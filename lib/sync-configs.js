// lib/sync-configs.js — Synchronize IDE configuration files from CLAUDE.md
'use strict';

const fs = require('fs');
const path = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────

const ERNE_START = '<!-- ERNE:START -->';
const ERNE_END = '<!-- ERNE:END -->';

const IDE_CONFIGS = {
  '.cursorrules': {
    label: '.cursorrules (Cursor)',
    transform: transformForCursorWindsurf,
  },
  '.windsurfrules': {
    label: '.windsurfrules (Windsurf)',
    transform: transformForCursorWindsurf,
  },
  'AGENTS.md': {
    label: 'AGENTS.md (Copilot)',
    transform: transformForAgentsMd,
  },
  'GEMINI.md': {
    label: 'GEMINI.md (Gemini)',
    transform: transformForGeminiMd,
  },
};

// ─── Transforms ───────────────────────────────────────────────────────────────

/**
 * Transform CLAUDE.md content into .cursorrules / .windsurfrules format.
 * These files use flat `#` headings and concise bullet points.
 */
function transformForCursorWindsurf(claudeMdContent) {
  const sections = extractCoreSections(claudeMdContent);

  const lines = [
    'You are an expert React Native and Expo developer working in an ERNE-powered project.',
    '',
  ];

  if (sections.stack) {
    lines.push('# Stack');
    lines.push(...formatStackAsList(sections.stack));
    lines.push('');
  }

  if (sections.keyRules) {
    // Flatten subsections into single-level headings
    const ruleBlocks = splitSubsections(sections.keyRules);
    for (const block of ruleBlocks) {
      lines.push(`# ${block.heading}`);
      lines.push(...block.lines);
      lines.push('');
    }
  }

  if (sections.git) {
    lines.push('# Git');
    lines.push(...sections.git);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

/**
 * Transform CLAUDE.md content into AGENTS.md format.
 * Uses `##` and `###` headings with more descriptive text.
 */
function transformForAgentsMd(claudeMdContent) {
  const sections = extractCoreSections(claudeMdContent);

  const lines = [
    '# ERNE \u2014 Everything React Native & Expo',
    '',
    'This project uses ERNE, a complete AI coding agent harness for React Native and Expo development.',
    '',
    '## Instructions for AI Agents',
    '',
    'You are an expert React Native and Expo developer. Follow these conventions strictly.',
    '',
  ];

  if (sections.stack) {
    lines.push('### Language & Framework');
    lines.push(...formatStackAsList(sections.stack));
    lines.push('');
  }

  if (sections.keyRules) {
    const ruleBlocks = splitSubsections(sections.keyRules);
    for (const block of ruleBlocks) {
      lines.push(`### ${block.heading}`);
      lines.push(...block.lines);
      lines.push('');
    }
  }

  if (sections.git) {
    lines.push('### Git Workflow');
    lines.push(...sections.git);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

/**
 * Transform CLAUDE.md content into GEMINI.md format.
 * Similar to .cursorrules but uses `##` headings.
 */
function transformForGeminiMd(claudeMdContent) {
  const sections = extractCoreSections(claudeMdContent);

  const lines = [
    '# ERNE \u2014 Everything React Native & Expo',
    '',
    'You are an expert React Native and Expo developer working in an ERNE-powered project.',
    '',
  ];

  if (sections.stack) {
    lines.push('## Stack');
    lines.push(...formatStackAsList(sections.stack));
    lines.push('');
  }

  if (sections.keyRules) {
    const ruleBlocks = splitSubsections(sections.keyRules);
    for (const block of ruleBlocks) {
      lines.push(`## ${block.heading}`);
      lines.push(...block.lines);
      lines.push('');
    }
  }

  if (sections.git) {
    lines.push('## Git');
    lines.push(...sections.git);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

// ─── Section extraction helpers ───────────────────────────────────────────────

/**
 * Extract the core sections from CLAUDE.md that are relevant for IDE configs.
 * Returns { stack, keyRules, git } where each is an array of lines or null.
 */
function extractCoreSections(content) {
  const lines = content.split('\n');
  const result = { stack: null, keyRules: null, git: null };

  let currentSection = null;
  let currentLines = [];

  for (const line of lines) {
    // Detect ## headings (top-level sections in CLAUDE.md)
    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      // Save previous section
      if (currentSection) {
        saveSection(result, currentSection, currentLines);
      }
      currentSection = h2Match[1].trim();
      currentLines = [];
      continue;
    }

    // Detect # heading (reset — we're past the relevant section)
    if (line.match(/^# /)) {
      if (currentSection) {
        saveSection(result, currentSection, currentLines);
      }
      currentSection = null;
      currentLines = [];
      continue;
    }

    if (currentSection) {
      currentLines.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    saveSection(result, currentSection, currentLines);
  }

  return result;
}

function saveSection(result, sectionName, lines) {
  // Trim leading/trailing empty lines
  const trimmed = trimEmptyLines(lines);
  if (trimmed.length === 0) return;

  const lower = sectionName.toLowerCase();
  if (lower.includes('stack')) {
    result.stack = trimmed;
  } else if (lower.includes('key rules')) {
    result.keyRules = trimmed;
  }
  // Git is a subsection of Key Rules, handled by splitSubsections
}

/**
 * Split a section into subsections by ### headings.
 * Returns [{heading, lines}, ...]
 */
function splitSubsections(lines) {
  const blocks = [];
  let currentHeading = null;
  let currentLines = [];

  for (const line of lines) {
    const h3Match = line.match(/^### (.+)/);
    if (h3Match) {
      if (currentHeading) {
        blocks.push({ heading: currentHeading, lines: trimEmptyLines(currentLines) });
      }
      currentHeading = h3Match[1].trim();
      currentLines = [];
      continue;
    }

    if (currentHeading) {
      currentLines.push(line);
    }
  }

  if (currentHeading) {
    blocks.push({ heading: currentHeading, lines: trimEmptyLines(currentLines) });
  }

  return blocks;
}

/**
 * Format stack lines: extract bullet points from the stack section.
 * Handles both `- **Key**: Value` and `- Value` formats.
 */
function formatStackAsList(stackLines) {
  const result = [];
  for (const line of stackLines) {
    // Skip note blocks
    if (line.startsWith('>')) continue;
    // Keep bullet points, strip bold markers for flat formats
    if (line.startsWith('- ')) {
      result.push(line);
    }
  }
  return result;
}

function trimEmptyLines(lines) {
  let start = 0;
  while (start < lines.length && lines[start].trim() === '') start++;
  let end = lines.length - 1;
  while (end > start && lines[end].trim() === '') end--;
  return lines.slice(start, end + 1);
}

// ─── Sync logic ───────────────────────────────────────────────────────────────

/**
 * Replace the ERNE-managed section of an IDE config file.
 * If the file has boundary markers, replace between them.
 * If not, wrap the entire content with markers (first sync).
 *
 * @param {string} existingContent - Current file content (or null if file doesn't exist)
 * @param {string} newErneContent - New ERNE-generated content
 * @returns {string} Updated file content
 */
function mergeContent(existingContent, newErneContent) {
  const wrapped = `${ERNE_START}\n${newErneContent.trimEnd()}\n${ERNE_END}`;

  if (!existingContent) {
    return wrapped + '\n';
  }

  const startIdx = existingContent.indexOf(ERNE_START);
  const endIdx = existingContent.indexOf(ERNE_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace between markers, preserving content before and after
    const before = existingContent.substring(0, startIdx);
    const after = existingContent.substring(endIdx + ERNE_END.length);
    return before + wrapped + after;
  }

  // No markers found — this is a pre-existing file without ERNE markers.
  // Wrap the new content with markers and prepend it, keeping user content after.
  return wrapped + '\n\n' + existingContent;
}

// ─── parseArgs ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(3);
  const opts = { dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      opts.dryRun = true;
    }
  }

  return opts;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function syncConfigs() {
  const opts = parseArgs();
  const cwd = process.cwd();

  console.log('\n  ERNE Sync Configs\n');

  // 1. Read CLAUDE.md as source of truth
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    console.error('  \u2717 CLAUDE.md not found. Run "erne init" first.');
    process.exit(1);
  }

  const claudeMdContent = fs.readFileSync(claudeMdPath, 'utf8');

  if (opts.dryRun) {
    console.log('  [dry-run] No files will be written.\n');
  }

  // 2. Detect which IDE configs exist and sync them
  const results = [];

  for (const [filename, config] of Object.entries(IDE_CONFIGS)) {
    const filePath = path.join(cwd, filename);
    const exists = fs.existsSync(filePath);

    if (!exists) {
      results.push({ filename, label: config.label, status: 'skipped', reason: 'not found' });
      continue;
    }

    try {
      const existingContent = fs.readFileSync(filePath, 'utf8');
      const newErneContent = config.transform(claudeMdContent);
      const merged = mergeContent(existingContent, newErneContent);

      // Check if content actually changed
      if (merged === existingContent) {
        results.push({ filename, label: config.label, status: 'unchanged' });
        continue;
      }

      if (!opts.dryRun) {
        fs.writeFileSync(filePath, merged);
      }

      results.push({ filename, label: config.label, status: 'synced' });
    } catch (err) {
      results.push({ filename, label: config.label, status: 'error', reason: err.message });
    }
  }

  // 3. Report results
  const synced = results.filter(r => r.status === 'synced');
  const unchanged = results.filter(r => r.status === 'unchanged');
  const skipped = results.filter(r => r.status === 'skipped');
  const errors = results.filter(r => r.status === 'error');

  for (const r of synced) {
    const prefix = opts.dryRun ? '[dry-run] would sync' : '\u2713';
    console.log(`  ${prefix} ${r.label}`);
  }

  for (const r of unchanged) {
    console.log(`  \u2013 ${r.label} (already up to date)`);
  }

  for (const r of skipped) {
    console.log(`  \u2013 ${r.label} (${r.reason})`);
  }

  for (const r of errors) {
    console.log(`  \u2717 ${r.label}: ${r.reason}`);
  }

  console.log(`\n  ${synced.length} synced, ${unchanged.length} unchanged, ${skipped.length} skipped${errors.length ? `, ${errors.length} errors` : ''}\n`);
}

module.exports = syncConfigs;

// Also export internals for testing
module.exports.extractCoreSections = extractCoreSections;
module.exports.mergeContent = mergeContent;
module.exports.transformForCursorWindsurf = transformForCursorWindsurf;
module.exports.transformForAgentsMd = transformForAgentsMd;
module.exports.transformForGeminiMd = transformForGeminiMd;
module.exports.ERNE_START = ERNE_START;
module.exports.ERNE_END = ERNE_END;
module.exports.IDE_CONFIGS = IDE_CONFIGS;
