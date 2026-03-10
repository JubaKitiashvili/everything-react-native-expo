#!/usr/bin/env node
// Extract patterns from session observations for /learn command

const fs = require('fs');
const path = require('path');

const OBS_DIR = path.resolve('.claude/memory/observations');

function extractPatterns() {
  if (!fs.existsSync(OBS_DIR)) {
    console.log('No observations directory found.');
    process.exit(0);
  }

  const files = fs.readdirSync(OBS_DIR).filter(f => f.endsWith('.json'));
  let allObs = [];

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(OBS_DIR, file), 'utf8'));
      allObs = allObs.concat(Array.isArray(data) ? data : [data]);
    } catch (e) {
      console.error(`Skipping corrupt file: ${file}`);
    }
  }

  console.log(`Loaded ${allObs.length} observations from ${files.length} files.`);

  // Group by file extension to find patterns
  const byExtension = {};
  for (const obs of allObs) {
    for (const file of (obs.files || [])) {
      const ext = path.extname(file);
      if (!byExtension[ext]) byExtension[ext] = [];
      byExtension[ext].push(obs);
    }
  }

  // Group by tool to find repeated fix patterns
  const byTool = {};
  for (const obs of allObs) {
    if (!byTool[obs.tool]) byTool[obs.tool] = [];
    byTool[obs.tool].push(obs);
  }

  // Output summary
  console.log('\n=== Pattern Summary ===');
  console.log(`File types modified: ${Object.keys(byExtension).join(', ')}`);
  console.log(`Tools used: ${JSON.stringify(byTool, (k, v) => Array.isArray(v) ? v.length : v)}`);

  return { byExtension, byTool, total: allObs.length };
}

extractPatterns();
