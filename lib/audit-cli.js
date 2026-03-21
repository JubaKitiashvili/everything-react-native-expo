'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { runScan } = require('./audit-scanner');

module.exports = async function audit() {
  const cwd = process.cwd();
  const args = process.argv.slice(2);
  const skipDepHealth = args.includes('--skip-dep-health');
  const showDiff = args.includes('--diff');
  const updateReadme = args.includes('--update-readme');

  // Ensure erne-docs directory
  const docsDir = path.join(cwd, 'erne-docs');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const dataPath = path.join(docsDir, 'audit-data.json');
  const prevPath = path.join(docsDir, '.audit-previous.json');

  // Save previous for diff
  if (fs.existsSync(dataPath)) {
    fs.copyFileSync(dataPath, prevPath);
  }

  console.log('\n  erne audit — Scanning project...\n');

  // Run scan
  const auditData = runScan(cwd, { skipDepHealth, maxFiles: 500 });

  // Save
  fs.writeFileSync(dataPath, JSON.stringify(auditData, null, 2));

  // Print summary
  printSummary(auditData);

  // Diff mode
  if (showDiff) {
    printDiff(docsDir, prevPath, auditData);
  }

  // README handling
  if (updateReadme) {
    handleReadme(cwd, auditData);
  }

  // Dashboard event (fire-and-forget)
  postDashboardEvent(auditData);

  console.log(`  Data saved to erne-docs/audit-data.json`);
  console.log(`  Run in Claude Code for full documentation generation.\n`);
};

/**
 * Print a summary of the audit scan results.
 */
function printSummary(data) {
  const g = '\x1b[32m';
  const y = '\x1b[33m';
  const c = '\x1b[36m';
  const d = '\x1b[2m';
  const r = '\x1b[0m';

  // File counts
  const totalFiles = data.meta ? data.meta.totalSourceFiles : 0;
  console.log(`  ${c}Files${r}        ${totalFiles} source files scanned`);

  // Structure
  if (data.structure) {
    const dirs = data.structure.directories ? data.structure.directories.length : 0;
    console.log(`  ${c}Directories${r}  ${dirs} detected`);
  }

  // Components
  if (data.components && data.components.components) {
    console.log(`  ${c}Components${r}   ${data.components.components.length} found`);
  }

  // Hooks
  if (data.hooks && data.hooks.hooks) {
    console.log(`  ${c}Hooks${r}        ${data.hooks.hooks.length} custom hooks`);
  }

  // Routes
  if (data.routes) {
    const total = data.routes.totalRoutes || 0;
    console.log(`  ${c}Routes${r}       ${total} routes`);
  }

  // Screens
  if (data.screens && data.screens.screens) {
    console.log(`  ${c}Screens${r}      ${data.screens.screens.length} screen files`);
  }

  // API layer
  if (data.apiLayer && data.apiLayer.endpoints) {
    console.log(`  ${c}API Layer${r}    ${data.apiLayer.endpoints.length} endpoints`);
  }

  // State
  if (data.state) {
    const stores = data.state.stores ? data.state.stores.length : 0;
    const contexts = data.state.contexts ? data.state.contexts.length : 0;
    console.log(`  ${c}State${r}        ${stores} stores, ${contexts} contexts`);
  }

  // Dead code
  if (data.deadCode && data.deadCode.deadExports) {
    const count = data.deadCode.deadExports.length;
    if (count > 0) {
      console.log(`  ${y}Dead Code${r}    ${count} potentially unused exports`);
    }
  }

  // Tech debt
  if (data.techDebt && data.techDebt.summary) {
    const s = data.techDebt.summary;
    const total = (s.todo || 0) + (s.fixme || 0) + (s.hack || 0) + (s.xxx || 0);
    if (total > 0) {
      console.log(`  ${y}Tech Debt${r}    ${total} markers (${s.todo || 0} TODO, ${s.fixme || 0} FIXME, ${s.hack || 0} HACK)`);
    }
  }

  // Type safety
  if (data.typeSafety && data.typeSafety.summary) {
    const anyCount = data.typeSafety.summary.totalAnyUsages || 0;
    if (anyCount > 0) {
      console.log(`  ${y}Type Safety${r}  ${anyCount} \`any\` usages found`);
    }
  }

  // Dependency health
  if (data.dependencyHealth && data.dependencyHealth.summary) {
    const s = data.dependencyHealth.summary;
    console.log(`  ${c}Dep Health${r}    ${s.total} packages — ${g}${s.healthy} healthy${r}, ${y}${s.outdated} outdated${r}, ${s.stale} stale, ${s.abandoned} abandoned`);
  }

  // Stack detection from dependencies
  if (data.dependencies && data.dependencies.categorized) {
    const cat = data.dependencies.categorized;
    const parts = [];
    if (cat.framework) parts.push(...Object.keys(cat.framework));
    if (cat.navigation) parts.push(...Object.keys(cat.navigation));
    if (cat.state) parts.push(...Object.keys(cat.state));
    if (parts.length > 0) {
      console.log(`  ${c}Stack${r}        ${parts.join(', ')}`);
    }
  }

  console.log();
}

/**
 * Print diff between previous and current audit.
 */
function printDiff(docsDir, prevPath, current) {
  if (!fs.existsSync(prevPath)) {
    console.log('  No previous audit data found — skipping diff.\n');
    return;
  }

  const g = '\x1b[32m';
  const red = '\x1b[31m';
  const y = '\x1b[33m';
  const r = '\x1b[0m';

  let previous;
  try {
    previous = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
  } catch {
    console.log('  Could not parse previous audit data — skipping diff.\n');
    return;
  }

  console.log('  --- Diff since last audit ---\n');
  let hasDiff = false;

  // Compare components
  hasDiff = diffNamedList('Components', previous.components, current.components, 'components', 'name', g, red, r) || hasDiff;

  // Compare hooks
  hasDiff = diffNamedList('Hooks', previous.hooks, current.hooks, 'hooks', 'name', g, red, r) || hasDiff;

  // Compare routes
  hasDiff = diffNamedList('Routes', previous.routes, current.routes, 'routes', 'path', g, red, r) || hasDiff;

  // Compare screens
  hasDiff = diffNamedList('Screens', previous.screens, current.screens, 'screens', 'file', g, red, r) || hasDiff;

  // File count diff
  const prevFiles = previous.meta ? previous.meta.totalSourceFiles : 0;
  const currFiles = current.meta ? current.meta.totalSourceFiles : 0;
  if (prevFiles !== currFiles) {
    const delta = currFiles - prevFiles;
    const sign = delta > 0 ? '+' : '';
    const color = delta > 0 ? g : red;
    console.log(`  ${y}Files${r}  ${prevFiles} -> ${currFiles} (${color}${sign}${delta}${r})`);
    hasDiff = true;
  }

  if (!hasDiff) {
    console.log('  No significant changes detected.\n');
  } else {
    console.log();
  }
}

/**
 * Diff a named list (components, hooks, routes, screens).
 */
function diffNamedList(label, prevData, currData, key, nameField, g, red, r) {
  const prevNames = new Set();
  const currNames = new Set();

  if (prevData && prevData[key]) {
    for (const item of prevData[key]) {
      prevNames.add(item[nameField] || '');
    }
  }
  if (currData && currData[key]) {
    for (const item of currData[key]) {
      currNames.add(item[nameField] || '');
    }
  }

  const added = [...currNames].filter(n => !prevNames.has(n));
  const removed = [...prevNames].filter(n => !currNames.has(n));

  if (added.length === 0 && removed.length === 0) return false;

  if (added.length > 0) {
    console.log(`  ${g}+ ${label}${r}  ${added.slice(0, 10).join(', ')}${added.length > 10 ? ` (+${added.length - 10} more)` : ''}`);
  }
  if (removed.length > 0) {
    console.log(`  ${red}- ${label}${r}  ${removed.slice(0, 10).join(', ')}${removed.length > 10 ? ` (+${removed.length - 10} more)` : ''}`);
  }
  return true;
}

/**
 * Handle README creation/update.
 */
function handleReadme(cwd, data) {
  const readmePath = path.join(cwd, 'erne-docs', 'AUDIT-README.md');

  if (fs.existsSync(readmePath)) {
    // Backup existing
    const backupPath = readmePath + '.bak';
    fs.copyFileSync(readmePath, backupPath);
    console.log(`  Backed up existing AUDIT-README.md to .bak`);
  }

  const totalFiles = data.meta ? data.meta.totalSourceFiles : 0;
  const components = data.components && data.components.components ? data.components.components.length : 0;
  const hooks = data.hooks && data.hooks.hooks ? data.hooks.hooks.length : 0;
  const routes = data.routes ? (data.routes.totalRoutes || 0) : 0;
  const scannedAt = data.meta ? data.meta.scannedAt : new Date().toISOString();

  const content = `# ERNE Audit Report

Generated: ${scannedAt}

## Summary

| Metric | Count |
|--------|-------|
| Source Files | ${totalFiles} |
| Components | ${components} |
| Custom Hooks | ${hooks} |
| Routes | ${routes} |

Full data: \`erne-docs/audit-data.json\`
`;

  fs.writeFileSync(readmePath, content);
  console.log(`  Created erne-docs/AUDIT-README.md`);
}

/**
 * Post audit event to dashboard (fire-and-forget).
 */
function postDashboardEvent(data) {
  try {
    const payload = JSON.stringify({
      type: 'audit-complete',
      timestamp: new Date().toISOString(),
      summary: {
        totalFiles: data.meta ? data.meta.totalSourceFiles : 0,
        components: data.components && data.components.components ? data.components.components.length : 0,
        hooks: data.hooks && data.hooks.hooks ? data.hooks.hooks.length : 0,
        routes: data.routes ? (data.routes.totalRoutes || 0) : 0,
      },
    });

    const req = http.request({
      hostname: 'localhost',
      port: 3333,
      path: '/api/events',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 2000,
    });

    req.on('error', () => { /* silent */ });
    req.on('timeout', () => { req.destroy(); });
    req.write(payload);
    req.end();
  } catch {
    // Fire-and-forget — ignore all errors
  }
}
