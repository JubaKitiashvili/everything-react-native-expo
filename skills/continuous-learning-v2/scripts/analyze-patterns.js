#!/usr/bin/env node
// Analyze extracted patterns and generate candidates

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function analyzePatterns(patterns) {
  const candidates = [];

  // Find repeated edits to same file patterns
  const filePatterns = {};
  for (const obs of patterns) {
    for (const file of (obs.files || [])) {
      const dir = path.dirname(file);
      const ext = path.extname(file);
      const key = `${dir}/*${ext}`;
      if (!filePatterns[key]) filePatterns[key] = { count: 0, files: [] };
      filePatterns[key].count++;
      filePatterns[key].files.push(file);
    }
  }

  // Generate candidates for patterns above threshold
  for (const [pattern, data] of Object.entries(filePatterns)) {
    if (data.count >= config.observationThreshold) {
      candidates.push({
        type: 'rule',
        pattern,
        occurrences: data.count,
        files: [...new Set(data.files)].slice(0, 5),
        confidence: data.count >= 5 ? 'high' : 'medium',
      });
    }
  }

  return candidates;
}

// Read from stdin or file
const input = process.argv[2];
if (input && fs.existsSync(input)) {
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  const candidates = analyzePatterns(data);
  console.log(JSON.stringify(candidates, null, 2));
} else {
  console.log('Usage: node analyze-patterns.js <observations.json>');
}
