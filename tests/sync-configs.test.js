// tests/sync-configs.test.js — Tests for IDE config synchronization from CLAUDE.md
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  extractCoreSections,
  mergeContent,
  transformForCursorWindsurf,
  transformForAgentsMd,
  transformForGeminiMd,
  ERNE_START,
  ERNE_END,
  IDE_CONFIGS,
} = require('../lib/sync-configs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tempDirs = [];

function createTempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-sync-test-'));
  tempDirs.push(dir);
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// Sample CLAUDE.md content for testing
const SAMPLE_CLAUDE_MD = `# ERNE — Everything React Native & Expo

## Project Stack

- **Framework**: React Native with Expo (managed)
- **Language**: TypeScript (strict mode)
- **Navigation**: Expo Router
- **State**: Zustand + TanStack Query

> **Note:** This section is auto-generated.

## Key Rules

### Code Style
- Functional components only with \`const\` + arrow functions
- PascalCase for components, camelCase for hooks/utils

### Performance
- Memoize with \`React.memo\`, \`useMemo\`, \`useCallback\`
- Use \`FlashList\` over \`FlatList\` for large lists

### Git
- Conventional Commits: \`feat:\`, \`fix:\`, \`refactor:\`
- Branch naming: \`feat/\`, \`fix/\`, \`refactor/\` prefix

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task

## Available Commands

Use \`/plan\`, \`/code-review\` for guided workflows.
`;

const MINIMAL_CLAUDE_MD = `# ERNE

## Project Stack

- **Framework**: React Native

## Key Rules

### Code Style
- Functional components only
`;

const EMPTY_SECTIONS_MD = `# ERNE

Some intro text without any ## headings.
`;

// ─── extractCoreSections ──────────────────────────────────────────────────────

describe('extractCoreSections', () => {
  it('extracts stack, keyRules from full CLAUDE.md', () => {
    const sections = extractCoreSections(SAMPLE_CLAUDE_MD);
    assert.ok(sections.stack, 'stack should be present');
    assert.ok(sections.keyRules, 'keyRules should be present');
  });

  it('stack contains bullet points', () => {
    const sections = extractCoreSections(SAMPLE_CLAUDE_MD);
    const stackText = sections.stack.join('\n');
    assert.ok(stackText.includes('Framework'), 'stack should include Framework');
    assert.ok(stackText.includes('Expo Router'), 'stack should include navigation');
  });

  it('keyRules contains subsection headings', () => {
    const sections = extractCoreSections(SAMPLE_CLAUDE_MD);
    const rulesText = sections.keyRules.join('\n');
    assert.ok(rulesText.includes('### Code Style'), 'should include Code Style heading');
    assert.ok(rulesText.includes('### Performance'), 'should include Performance heading');
    assert.ok(rulesText.includes('### Git'), 'should include Git heading');
  });

  it('does not include sections after a new # heading', () => {
    const sections = extractCoreSections(SAMPLE_CLAUDE_MD);
    const rulesText = sections.keyRules ? sections.keyRules.join('\n') : '';
    assert.ok(!rulesText.includes('Workflow Orchestration'), 'should not include Workflow section');
    assert.ok(!rulesText.includes('Available Commands'), 'should not include Commands section');
  });

  it('returns null for missing sections', () => {
    const sections = extractCoreSections(EMPTY_SECTIONS_MD);
    assert.equal(sections.stack, null);
    assert.equal(sections.keyRules, null);
    assert.equal(sections.git, null);
  });

  it('handles empty string', () => {
    const sections = extractCoreSections('');
    assert.equal(sections.stack, null);
    assert.equal(sections.keyRules, null);
    assert.equal(sections.git, null);
  });

  it('handles content with only stack section', () => {
    const sections = extractCoreSections(MINIMAL_CLAUDE_MD);
    assert.ok(sections.stack, 'stack should be present');
    assert.ok(sections.keyRules, 'keyRules should be present');
  });

  it('trims leading/trailing empty lines from sections', () => {
    const content = `## Project Stack\n\n\n- **Framework**: React Native\n\n\n## Key Rules\n\n### Code Style\n- Rule one\n\n`;
    const sections = extractCoreSections(content);
    assert.ok(sections.stack);
    assert.equal(sections.stack[0], '- **Framework**: React Native');
    assert.equal(sections.stack.length, 1);
  });
});

// ─── transformForCursorWindsurf ───────────────────────────────────────────────

describe('transformForCursorWindsurf', () => {
  it('produces output starting with expert declaration', () => {
    const result = transformForCursorWindsurf(SAMPLE_CLAUDE_MD);
    assert.ok(result.startsWith('You are an expert React Native'));
  });

  it('uses flat # headings for sections', () => {
    const result = transformForCursorWindsurf(SAMPLE_CLAUDE_MD);
    assert.ok(result.includes('# Stack'));
    assert.ok(result.includes('# Code Style'));
    assert.ok(result.includes('# Performance'));
    assert.ok(result.includes('# Git'));
  });

  it('does not include ## or ### headings', () => {
    const result = transformForCursorWindsurf(SAMPLE_CLAUDE_MD);
    assert.ok(!result.includes('## '), 'should not contain ## headings');
    assert.ok(!result.includes('### '), 'should not contain ### headings');
  });

  it('includes stack bullet points', () => {
    const result = transformForCursorWindsurf(SAMPLE_CLAUDE_MD);
    assert.ok(result.includes('- **Framework**: React Native with Expo (managed)'));
  });

  it('strips note blocks from stack', () => {
    const result = transformForCursorWindsurf(SAMPLE_CLAUDE_MD);
    assert.ok(!result.includes('> **Note:**'), 'should strip > note blocks');
  });

  it('ends with newline', () => {
    const result = transformForCursorWindsurf(SAMPLE_CLAUDE_MD);
    assert.ok(result.endsWith('\n'));
  });

  it('handles empty content gracefully', () => {
    const result = transformForCursorWindsurf('');
    assert.ok(result.includes('You are an expert'));
    assert.ok(result.endsWith('\n'));
  });

  it('handles content with no key rules', () => {
    const content = `## Project Stack\n- **Framework**: React Native\n`;
    const result = transformForCursorWindsurf(content);
    assert.ok(result.includes('# Stack'));
    assert.ok(!result.includes('# Code Style'));
  });
});

// ─── transformForAgentsMd ─────────────────────────────────────────────────────

describe('transformForAgentsMd', () => {
  it('starts with ERNE title and agent instructions', () => {
    const result = transformForAgentsMd(SAMPLE_CLAUDE_MD);
    assert.ok(result.includes('# ERNE'));
    assert.ok(result.includes('## Instructions for AI Agents'));
  });

  it('uses ### headings for subsections', () => {
    const result = transformForAgentsMd(SAMPLE_CLAUDE_MD);
    assert.ok(result.includes('### Language & Framework'));
    assert.ok(result.includes('### Code Style'));
    assert.ok(result.includes('### Performance'));
    assert.ok(result.includes('### Git'));
  });

  it('includes stack items', () => {
    const result = transformForAgentsMd(SAMPLE_CLAUDE_MD);
    assert.ok(result.includes('- **Framework**: React Native with Expo (managed)'));
  });

  it('ends with newline', () => {
    const result = transformForAgentsMd(SAMPLE_CLAUDE_MD);
    assert.ok(result.endsWith('\n'));
  });

  it('handles empty content', () => {
    const result = transformForAgentsMd('');
    assert.ok(result.includes('# ERNE'));
    assert.ok(result.endsWith('\n'));
  });
});

// ─── transformForGeminiMd ─────────────────────────────────────────────────────

describe('transformForGeminiMd', () => {
  it('starts with ERNE title', () => {
    const result = transformForGeminiMd(SAMPLE_CLAUDE_MD);
    assert.ok(result.includes('# ERNE'));
  });

  it('uses ## headings for sections', () => {
    const result = transformForGeminiMd(SAMPLE_CLAUDE_MD);
    assert.ok(result.includes('## Stack'));
    assert.ok(result.includes('## Code Style'));
    assert.ok(result.includes('## Performance'));
    assert.ok(result.includes('## Git'));
  });

  it('does not use ### headings', () => {
    const result = transformForGeminiMd(SAMPLE_CLAUDE_MD);
    assert.ok(!result.includes('### '));
  });

  it('includes stack items', () => {
    const result = transformForGeminiMd(SAMPLE_CLAUDE_MD);
    assert.ok(result.includes('- **Framework**: React Native with Expo (managed)'));
  });

  it('ends with newline', () => {
    const result = transformForGeminiMd(SAMPLE_CLAUDE_MD);
    assert.ok(result.endsWith('\n'));
  });

  it('handles empty content', () => {
    const result = transformForGeminiMd('');
    assert.ok(result.includes('# ERNE'));
    assert.ok(result.endsWith('\n'));
  });
});

// ─── mergeContent ─────────────────────────────────────────────────────────────

describe('mergeContent', () => {
  const sampleContent = 'New ERNE content here';

  it('wraps content with markers when no existing content', () => {
    const result = mergeContent(null, sampleContent);
    assert.ok(result.includes(ERNE_START));
    assert.ok(result.includes(ERNE_END));
    assert.ok(result.includes(sampleContent));
    assert.ok(result.endsWith('\n'));
  });

  it('wraps content with markers for empty string existing content', () => {
    // null means file doesn't exist; empty string is technically a file
    const result = mergeContent(null, sampleContent);
    assert.equal(result, `${ERNE_START}\n${sampleContent}\n${ERNE_END}\n`);
  });

  it('replaces between existing markers', () => {
    const existing = `Some preamble\n${ERNE_START}\nOld content\n${ERNE_END}\nSome postamble`;
    const result = mergeContent(existing, sampleContent);
    assert.ok(result.includes('Some preamble'));
    assert.ok(result.includes('Some postamble'));
    assert.ok(result.includes(sampleContent));
    assert.ok(!result.includes('Old content'));
  });

  it('preserves content before and after markers', () => {
    const existing = `# My custom rules\n\n${ERNE_START}\nOld ERNE stuff\n${ERNE_END}\n\n# My notes\nKeep this`;
    const result = mergeContent(existing, sampleContent);
    assert.ok(result.includes('# My custom rules'));
    assert.ok(result.includes('# My notes'));
    assert.ok(result.includes('Keep this'));
  });

  it('prepends with markers when file exists without markers', () => {
    const existing = '# My existing rules\n- Rule 1\n- Rule 2\n';
    const result = mergeContent(existing, sampleContent);
    assert.ok(result.startsWith(ERNE_START));
    assert.ok(result.includes(sampleContent));
    assert.ok(result.includes(ERNE_END));
    assert.ok(result.includes('# My existing rules'));
    // User content should come after the ERNE block
    const erneEndIdx = result.indexOf(ERNE_END);
    const userIdx = result.indexOf('# My existing rules');
    assert.ok(userIdx > erneEndIdx, 'user content should come after ERNE block');
  });

  it('trims trailing whitespace from new content', () => {
    const result = mergeContent(null, 'content with trailing space   \n\n');
    assert.ok(result.includes('content with trailing space'));
    // The content between markers should be trimmed
    const between = result.substring(
      result.indexOf(ERNE_START) + ERNE_START.length + 1,
      result.indexOf(ERNE_END) - 1,
    );
    assert.ok(!between.endsWith(' '), 'trailing spaces should be trimmed');
  });

  it('handles multiline new content', () => {
    const multiline = '# Stack\n- React Native\n\n# Rules\n- Be good';
    const result = mergeContent(null, multiline);
    assert.ok(result.includes('# Stack'));
    assert.ok(result.includes('# Rules'));
  });
});

// ─── IDE_CONFIGS structure ────────────────────────────────────────────────────

describe('IDE_CONFIGS', () => {
  it('contains all four IDE config targets', () => {
    const keys = Object.keys(IDE_CONFIGS);
    assert.equal(keys.length, 4);
    assert.ok(keys.includes('.cursorrules'));
    assert.ok(keys.includes('.windsurfrules'));
    assert.ok(keys.includes('AGENTS.md'));
    assert.ok(keys.includes('GEMINI.md'));
  });

  it('each config has label and transform function', () => {
    for (const [filename, config] of Object.entries(IDE_CONFIGS)) {
      assert.ok(config.label, `${filename} should have a label`);
      assert.equal(typeof config.transform, 'function', `${filename} should have a transform function`);
    }
  });

  it('.cursorrules and .windsurfrules share the same transform', () => {
    assert.equal(IDE_CONFIGS['.cursorrules'].transform, IDE_CONFIGS['.windsurfrules'].transform);
  });
});

// ─── Boundary markers ─────────────────────────────────────────────────────────

describe('Boundary markers', () => {
  it('ERNE_START is an HTML comment', () => {
    assert.ok(ERNE_START.startsWith('<!--'));
    assert.ok(ERNE_START.endsWith('-->'));
  });

  it('ERNE_END is an HTML comment', () => {
    assert.ok(ERNE_END.startsWith('<!--'));
    assert.ok(ERNE_END.endsWith('-->'));
  });
});

// ─── Integration: syncConfigs with temp directory ─────────────────────────────

describe('syncConfigs integration', () => {
  it('syncs .cursorrules file in a temp project', () => {
    const dir = createTempProject({
      'CLAUDE.md': SAMPLE_CLAUDE_MD,
      '.cursorrules': '# Old cursor rules\n- old rule\n',
    });

    const claudeMd = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    const existing = fs.readFileSync(path.join(dir, '.cursorrules'), 'utf8');
    const transformed = transformForCursorWindsurf(claudeMd);
    const merged = mergeContent(existing, transformed);

    fs.writeFileSync(path.join(dir, '.cursorrules'), merged);

    const result = fs.readFileSync(path.join(dir, '.cursorrules'), 'utf8');
    assert.ok(result.includes(ERNE_START));
    assert.ok(result.includes(ERNE_END));
    assert.ok(result.includes('# Stack'));
    assert.ok(result.includes('# Old cursor rules'), 'should preserve original content');
  });

  it('replaces existing ERNE block on re-sync', () => {
    const dir = createTempProject({
      'CLAUDE.md': SAMPLE_CLAUDE_MD,
    });

    const claudeMd = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');

    // First sync
    const transformed1 = transformForCursorWindsurf(claudeMd);
    const merged1 = mergeContent(null, transformed1);
    const cursorPath = path.join(dir, '.cursorrules');
    fs.writeFileSync(cursorPath, merged1);

    // Second sync (should replace, not duplicate)
    const existing = fs.readFileSync(cursorPath, 'utf8');
    const transformed2 = transformForCursorWindsurf(claudeMd);
    const merged2 = mergeContent(existing, transformed2);
    fs.writeFileSync(cursorPath, merged2);

    const result = fs.readFileSync(cursorPath, 'utf8');
    // Should only have one pair of markers
    const startCount = (result.match(new RegExp(ERNE_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    const endCount = (result.match(new RegExp(ERNE_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    assert.equal(startCount, 1, 'should have exactly one ERNE_START marker');
    assert.equal(endCount, 1, 'should have exactly one ERNE_END marker');
  });

  it('syncs all four IDE configs when present', () => {
    const dir = createTempProject({
      'CLAUDE.md': SAMPLE_CLAUDE_MD,
      '.cursorrules': '',
      '.windsurfrules': '',
      'AGENTS.md': '',
      'GEMINI.md': '',
    });

    const claudeMd = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');

    for (const [filename, config] of Object.entries(IDE_CONFIGS)) {
      const filePath = path.join(dir, filename);
      const existing = fs.readFileSync(filePath, 'utf8');
      const transformed = config.transform(claudeMd);
      const merged = mergeContent(existing || null, transformed);
      fs.writeFileSync(filePath, merged);

      const result = fs.readFileSync(filePath, 'utf8');
      assert.ok(result.includes(ERNE_START), `${filename} should have ERNE_START`);
      assert.ok(result.includes(ERNE_END), `${filename} should have ERNE_END`);
    }
  });

  it('does not modify file when content is unchanged', () => {
    const dir = createTempProject({
      'CLAUDE.md': SAMPLE_CLAUDE_MD,
    });

    const claudeMd = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    const transformed = transformForCursorWindsurf(claudeMd);
    const initial = mergeContent(null, transformed);

    const cursorPath = path.join(dir, '.cursorrules');
    fs.writeFileSync(cursorPath, initial);

    // Re-sync: merged should equal existing
    const existing = fs.readFileSync(cursorPath, 'utf8');
    const merged = mergeContent(existing, transformed);
    assert.equal(merged, existing, 'content should be identical when nothing changed');
  });

  it('handles CLAUDE.md with only a stack section', () => {
    const dir = createTempProject({
      'CLAUDE.md': `## Project Stack\n\n- **Framework**: React Native\n`,
      '.cursorrules': '',
    });

    const claudeMd = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    const transformed = transformForCursorWindsurf(claudeMd);
    assert.ok(transformed.includes('# Stack'));
    assert.ok(transformed.includes('- **Framework**: React Native'));
    assert.ok(!transformed.includes('# Code Style'));
  });

  it('preserves user content outside ERNE markers after multiple syncs', () => {
    const dir = createTempProject({
      'CLAUDE.md': SAMPLE_CLAUDE_MD,
    });

    const claudeMd = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    const cursorPath = path.join(dir, '.cursorrules');

    // First sync — simulate file with user content + ERNE block
    const transformed = transformForCursorWindsurf(claudeMd);
    const initial = mergeContent(null, transformed);
    // User adds custom content after the ERNE block
    const withUserContent = initial + '\n# My Custom Rules\n- Do not use any\n';
    fs.writeFileSync(cursorPath, withUserContent);

    // Second sync
    const existing = fs.readFileSync(cursorPath, 'utf8');
    const merged = mergeContent(existing, transformed);
    fs.writeFileSync(cursorPath, merged);

    const result = fs.readFileSync(cursorPath, 'utf8');
    assert.ok(result.includes('# My Custom Rules'), 'user content should be preserved');
    assert.ok(result.includes('- Do not use any'), 'user rule should be preserved');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('extractCoreSections handles content with only # headings (no ##)', () => {
    const content = `# Title\n\nSome text\n\n# Another Title\n\nMore text`;
    const sections = extractCoreSections(content);
    assert.equal(sections.stack, null);
    assert.equal(sections.keyRules, null);
  });

  it('extractCoreSections handles ## headings that do not match known names', () => {
    const content = `## Random Section\n\n- Some content\n\n## Another Random\n\n- More content`;
    const sections = extractCoreSections(content);
    assert.equal(sections.stack, null);
    assert.equal(sections.keyRules, null);
  });

  it('transforms produce distinct output for different IDE targets', () => {
    const cursor = transformForCursorWindsurf(SAMPLE_CLAUDE_MD);
    const agents = transformForAgentsMd(SAMPLE_CLAUDE_MD);
    const gemini = transformForGeminiMd(SAMPLE_CLAUDE_MD);

    assert.notEqual(cursor, agents);
    assert.notEqual(cursor, gemini);
    assert.notEqual(agents, gemini);
  });

  it('mergeContent handles content with only ERNE_START but no ERNE_END', () => {
    const existing = `${ERNE_START}\nOld content without end marker`;
    const result = mergeContent(existing, 'New content');
    // Should prepend since markers are incomplete
    assert.ok(result.includes(ERNE_START));
    assert.ok(result.includes(ERNE_END));
    assert.ok(result.includes('New content'));
  });

  it('mergeContent handles content with only ERNE_END but no ERNE_START', () => {
    const existing = `Old content without start marker\n${ERNE_END}`;
    const result = mergeContent(existing, 'New content');
    assert.ok(result.includes(ERNE_START));
    assert.ok(result.includes(ERNE_END));
    assert.ok(result.includes('New content'));
  });

  it('stack formatting skips > note lines', () => {
    const content = `## Project Stack\n\n- **Framework**: RN\n> Note: auto-generated\n- **State**: Zustand\n`;
    const sections = extractCoreSections(content);
    const cursor = transformForCursorWindsurf(content);
    assert.ok(cursor.includes('- **Framework**: RN'));
    assert.ok(cursor.includes('- **State**: Zustand'));
    assert.ok(!cursor.includes('> Note'));
  });
});
