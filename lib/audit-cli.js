// lib/audit-cli.js — CLI wrapper for project audit
'use strict';

const { runAudit } = require('./audit');

module.exports = async function audit() {
  const cwd = process.cwd();

  console.log('\n  erne audit — Analyzing your project...\n');

  const { findings, strengths, score } = runAudit(cwd);

  const critical = findings.filter(f => f.severity === 'critical');
  const warnings = findings.filter(f => f.severity === 'warning');
  const info = findings.filter(f => f.severity === 'info');

  // Score display
  const scoreBar = '█'.repeat(Math.floor(score / 5)) + '░'.repeat(20 - Math.floor(score / 5));
  const scoreColor = score >= 80 ? '\x1b[32m' : score >= 60 ? '\x1b[33m' : '\x1b[31m';
  const reset = '\x1b[0m';

  console.log(`  Score: ${scoreColor}${score}/100${reset}  [${scoreBar}]\n`);

  // Strengths
  if (strengths.length > 0) {
    console.log(`  ${strengths.length} Strengths:`);
    for (const s of strengths.slice(0, 10)) {
      console.log(`    \x1b[32m✓\x1b[0m ${s.title}`);
    }
    if (strengths.length > 10) console.log(`    ... and ${strengths.length - 10} more`);
    console.log();
  }

  // Critical
  if (critical.length > 0) {
    console.log(`  ${critical.length} Critical:`);
    for (const f of critical) {
      console.log(`    \x1b[31m✗\x1b[0m ${f.title}`);
      console.log(`      ${f.detail}`);
      console.log(`      Fix: ${f.fix}`);
    }
    console.log();
  }

  // Warnings
  if (warnings.length > 0) {
    console.log(`  ${warnings.length} Warnings:`);
    for (const f of warnings) {
      console.log(`    \x1b[33m⚠\x1b[0m ${f.title} — ${f.detail}`);
    }
    console.log();
  }

  // Info
  if (info.length > 0) {
    console.log(`  ${info.length} Suggestions:`);
    for (const f of info) {
      console.log(`    \x1b[36m→\x1b[0m ${f.title}`);
    }
    console.log();
  }

  console.log(`  Full report saved to .erne/audit.md and .erne/audit.json\n`);
};
