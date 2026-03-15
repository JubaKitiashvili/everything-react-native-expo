'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { openProjectDb, closeDb } = require('../../dashboard/lib/context/db');
const { summarize, detectContentType } = require('../../dashboard/lib/context/summarizer');
const { ContentStore } = require('../../dashboard/lib/context/content-store');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

function formatBytes(b) {
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

// ── Part 1: Summarizer (ctx_execute_file equivalent) — 14 scenarios ─────────

describe('ERNE Benchmark — Part 1: Summarizer (structured data processing)', () => {
  const results = [];

  after(() => {
    console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ Part 1: Summarizer Results                                                   │');
    console.log('├──────────────────────────────────┬──────────┬──────────┬─────────┬────────────┤');
    console.log('│ Scenario                         │ Raw Size │ Context  │ Savings │ Type       │');
    console.log('├──────────────────────────────────┼──────────┼──────────┼─────────┼────────────┤');
    let totalRaw = 0, totalContext = 0;
    for (const r of results) {
      const name = r.name.padEnd(32).slice(0, 32);
      const raw = formatBytes(r.originalBytes).padStart(8);
      const ctx = formatBytes(r.summaryBytes).padStart(8);
      const sav = `${r.savingsPct}%`.padStart(5);
      const type = r.contentType.padEnd(10).slice(0, 10);
      console.log(`│ ${name} │ ${raw} │ ${ctx} │ ${sav}   │ ${type} │`);
      totalRaw += r.originalBytes;
      totalContext += r.summaryBytes;
    }
    const totalSavings = totalRaw > 0 ? Math.round(((totalRaw - totalContext) / totalRaw) * 100) : 0;
    console.log('├──────────────────────────────────┼──────────┼──────────┼─────────┼────────────┤');
    console.log(`│ TOTAL                            │ ${formatBytes(totalRaw).padStart(8)} │ ${formatBytes(totalContext).padStart(8)} │ ${`${totalSavings}%`.padStart(5)}   │            │`);
    console.log('└──────────────────────────────────┴──────────┴──────────┴─────────┴────────────┘');
  });

  const summarizerScenarios = [
    { fixture: 'context7-react-docs.md', name: 'React useEffect docs', source: 'Context7', minSavings: 90 },
    { fixture: 'context7-nextjs-docs.md', name: 'Next.js App Router docs', source: 'Context7', minSavings: 90 },
    { fixture: 'context7-tailwind-docs.md', name: 'Tailwind CSS docs', source: 'Context7', minSavings: 90 },
    { fixture: 'playwright-snapshot.txt', name: 'Page snapshot (HN)', source: 'Playwright', minSavings: 95 },
    { fixture: 'playwright-network.txt', name: 'Network requests', source: 'Playwright', minSavings: 0 },
    { fixture: 'github-prs.json', name: 'PR list (vercel/next.js)', source: 'GitHub', minSavings: 85 },
    { fixture: 'github-issues.json', name: 'Issues (facebook/react)', source: 'GitHub', minSavings: 95 },
    { fixture: 'test-output.txt', name: 'Test output (30 suites)', source: 'vitest', minSavings: 85 },
    { fixture: 'tsc-errors.txt', name: 'TypeScript errors (50)', source: 'tsc', minSavings: 85 },
    { fixture: 'build-output.txt', name: 'Build output (100+ lines)', source: 'next build', minSavings: 90 },
    { fixture: 'mcp-tools.json', name: 'MCP tools (40 tools)', source: 'MCP tools/list', minSavings: 90 },
    { fixture: 'access.log', name: 'Access log (500 reqs)', source: 'nginx', minSavings: 98 },
    { fixture: 'git-log.txt', name: 'Git log (150+ commits)', source: 'git', minSavings: 95 },
    { fixture: 'analytics.csv', name: 'Analytics CSV (500 rows)', source: 'analytics', minSavings: 98 },
  ];

  for (const scenario of summarizerScenarios) {
    it(`${scenario.name} (${scenario.source}) — ≥${scenario.minSavings}% savings`, () => {
      const fixturePath = path.join(FIXTURES_DIR, scenario.fixture);
      if (!fs.existsSync(fixturePath)) {
        // Skip if fixture not yet created
        results.push({ name: scenario.name, originalBytes: 0, summaryBytes: 0, savingsPct: 0, contentType: 'MISSING' });
        return;
      }

      const content = readFixture(scenario.fixture);
      const result = summarize(content);

      results.push({
        name: scenario.name,
        originalBytes: result.originalBytes,
        summaryBytes: result.summaryBytes,
        savingsPct: result.savingsPct,
        contentType: result.contentType,
      });

      // Validate savings meet threshold
      assert.ok(
        result.savingsPct >= scenario.minSavings,
        `${scenario.name}: Expected ≥${scenario.minSavings}% savings, got ${result.savingsPct}% (${formatBytes(result.originalBytes)} → ${formatBytes(result.summaryBytes)})`
      );

      // Validate summary is not empty
      assert.ok(result.summary.length > 0, 'Summary should not be empty');

      // Validate content type was detected
      assert.notStrictEqual(result.contentType, 'unknown', `Should detect content type for ${scenario.fixture}`);
    });
  }
});

// ── Part 2: Index+Search (ctx_index + ctx_search equivalent) — 6 scenarios ──

describe('ERNE Benchmark — Part 2: Index+Search (knowledge retrieval)', () => {
  let db;
  let store;
  let tmpDir;
  const results = [];

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-bench-'));
    db = openProjectDb(path.join(tmpDir, 'bench.db'));
    store = new ContentStore(db);
  });

  after(() => {
    closeDb(db);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    console.log('\n┌──────────────────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ Part 2: Index+Search Results                                                             │');
    console.log('├──────────────────────────────────┬──────────┬────────────────┬─────────┬────────┬────────┤');
    console.log('│ Scenario                         │ Raw Size │ Search Result  │ Savings │ Chunks │ Queries│');
    console.log('├──────────────────────────────────┼──────────┼────────────────┼─────────┼────────┼────────┤');
    let totalRaw = 0, totalContext = 0;
    for (const r of results) {
      const name = r.name.padEnd(32).slice(0, 32);
      const raw = formatBytes(r.originalBytes).padStart(8);
      const ctx = formatBytes(r.searchBytes).padStart(14);
      const sav = `${r.savingsPct}%`.padStart(5);
      const chunks = String(r.chunks).padStart(6);
      const queries = String(r.queries).padStart(6);
      console.log(`│ ${name} │ ${raw} │ ${ctx} │ ${sav}   │ ${chunks} │ ${queries} │`);
      totalRaw += r.originalBytes;
      totalContext += r.searchBytes;
    }
    const totalSavings = totalRaw > 0 ? Math.round(((totalRaw - totalContext) / totalRaw) * 100) : 0;
    console.log('├──────────────────────────────────┼──────────┼────────────────┼─────────┼────────┼────────┤');
    console.log(`│ TOTAL                            │ ${formatBytes(totalRaw).padStart(8)} │ ${formatBytes(totalContext).padStart(14)} │ ${`${totalSavings}%`.padStart(5)}   │        │        │`);
    console.log('└──────────────────────────────────┴──────────┴────────────────┴─────────┴────────┴────────┘');
  });

  const searchScenarios = [
    {
      fixture: 'context7-supabase-edge.md',
      name: 'Supabase Edge Functions',
      source: 'Context7',
      queries: ['edge function deploy', 'Deno serve handler', 'environment variables'],
      minSavings: 60,
    },
    {
      fixture: 'context7-react-docs.md',
      name: 'React useEffect docs',
      source: 'Context7',
      queries: ['cleanup function', 'dependency array', 'async effects'],
      minSavings: 75,
    },
    {
      fixture: 'context7-nextjs-docs.md',
      name: 'Next.js App Router docs',
      source: 'Context7',
      queries: ['file-based routing', 'loading state', 'server components'],
      minSavings: 60,
    },
    {
      fixture: 'context7-tailwind-docs.md',
      name: 'Tailwind CSS docs',
      source: 'Context7',
      queries: ['responsive design', 'dark mode', 'custom theme'],
      minSavings: 75,
    },
    {
      fixture: 'context7-react-docs.md',
      name: 'React hooks (re-search)',
      source: 'Context7',
      queries: ['useState', 'useEffect lifecycle', 'custom hooks'],
      minSavings: 70,
    },
    {
      fixture: 'context7-nextjs-docs.md',
      name: 'Next.js API routes',
      source: 'Context7',
      queries: ['API route handler', 'middleware', 'dynamic routes'],
      minSavings: 70,
    },
  ];

  for (const scenario of searchScenarios) {
    it(`${scenario.name} — ≥${scenario.minSavings}% savings (${scenario.queries.length} queries)`, () => {
      const fixturePath = path.join(FIXTURES_DIR, scenario.fixture);
      if (!fs.existsSync(fixturePath)) {
        results.push({ name: scenario.name, originalBytes: 0, searchBytes: 0, savingsPct: 0, chunks: 0, queries: scenario.queries.length });
        return;
      }

      const content = readFixture(scenario.fixture);
      const originalBytes = content.length;

      // Index the content
      const indexResult = store.index(content, scenario.fixture);

      // Run all queries and accumulate results
      let totalSearchBytes = 0;
      let totalChunks = 0;
      for (const query of scenario.queries) {
        const searchResult = store.search(query);
        totalSearchBytes += searchResult.totalBytes;
        totalChunks += searchResult.results;
      }

      const savingsPct = originalBytes > 0
        ? Math.round(((originalBytes - totalSearchBytes) / originalBytes) * 100)
        : 0;

      results.push({
        name: scenario.name,
        originalBytes,
        searchBytes: totalSearchBytes,
        savingsPct,
        chunks: totalChunks,
        queries: scenario.queries.length,
      });

      assert.ok(
        savingsPct >= scenario.minSavings,
        `${scenario.name}: Expected ≥${scenario.minSavings}% savings, got ${savingsPct}% (${formatBytes(originalBytes)} → ${formatBytes(totalSearchBytes)})`
      );
    });
  }
});

// ── Part 3: Combined — Full debugging session simulation ────────────────────

describe('ERNE Benchmark — Part 3: Full session simulation', () => {
  let db;
  let store;
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-session-'));
    db = openProjectDb(path.join(tmpDir, 'session.db'));
    store = new ContentStore(db);
  });

  after(() => {
    closeDb(db);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Full debugging session achieves ≥90% total savings', () => {
    const session = [
      // Developer reads docs (summarize)
      { action: 'summarize', fixture: 'context7-react-docs.md', label: 'Context7 docs (React)' },
      { action: 'summarize', fixture: 'context7-nextjs-docs.md', label: 'Context7 docs (Next.js)' },
      // Browser snapshot (summarize)
      { action: 'summarize', fixture: 'playwright-snapshot.txt', label: 'Playwright snapshot' },
      // GitHub issues (summarize)
      { action: 'summarize', fixture: 'github-issues.json', label: 'GitHub issues' },
      // Test run (summarize)
      { action: 'summarize', fixture: 'test-output.txt', label: 'Test output' },
      // Build (summarize)
      { action: 'summarize', fixture: 'build-output.txt', label: 'Build output' },
      // Targeted doc search (index+search)
      { action: 'search', fixture: 'context7-react-docs.md', query: 'useEffect cleanup', label: 'Search: cleanup' },
      { action: 'search', fixture: 'context7-nextjs-docs.md', query: 'server component data', label: 'Search: server' },
    ];

    let totalRaw = 0;
    let totalContext = 0;

    for (const step of session) {
      const fixturePath = path.join(FIXTURES_DIR, step.fixture);
      if (!fs.existsSync(fixturePath)) continue;

      const content = readFixture(step.fixture);
      totalRaw += content.length;

      if (step.action === 'summarize') {
        const result = summarize(content);
        totalContext += result.summaryBytes;
      } else {
        store.index(content, step.fixture);
        const result = store.search(step.query);
        totalContext += result.totalBytes;
      }
    }

    const totalSavings = totalRaw > 0 ? Math.round(((totalRaw - totalContext) / totalRaw) * 100) : 0;

    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│ Part 3: Full Session Simulation                        │');
    console.log('├────────────────────────────────────────────────────────┤');
    console.log(`│ Total raw data processed:  ${formatBytes(totalRaw).padStart(10)}                  │`);
    console.log(`│ Total context consumed:    ${formatBytes(totalContext).padStart(10)}                  │`);
    console.log(`│ Overall context savings:   ${`${totalSavings}%`.padStart(10)}                  │`);
    console.log(`│ Context used (of 200K):    ${`${((totalContext / 200000) * 100).toFixed(1)}%`.padStart(10)}                  │`);
    console.log('└────────────────────────────────────────────────────────┘');

    assert.ok(totalSavings >= 90, `Full session should achieve ≥90% savings, got ${totalSavings}%`);
  });
});
