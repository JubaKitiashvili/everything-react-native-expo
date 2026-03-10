#!/usr/bin/env node
// Validate generated rules and skills have correct format

const fs = require('fs');
const path = require('path');

function validateFrontmatter(content) {
  const errors = [];

  // Check starts with ---
  if (!content.startsWith('---\n')) {
    errors.push('File must start with --- (YAML frontmatter)');
    return errors;
  }

  // Find closing ---
  const endIndex = content.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    errors.push('Frontmatter must be closed with ---');
    return errors;
  }

  const frontmatter = content.slice(4, endIndex);

  // Check required fields based on type
  if (content.includes('name:') && content.includes('description:')) {
    // Skill or command format — valid
  } else if (content.includes('description:')) {
    // Rule format — valid
  } else {
    errors.push('Frontmatter must contain at least a "description" field');
  }

  return errors;
}

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const errors = validateFrontmatter(content);

  // Check for content after frontmatter
  const contentStart = content.indexOf('\n---\n', 4);
  if (contentStart !== -1) {
    const body = content.slice(contentStart + 5).trim();
    if (body.length < 50) {
      errors.push('Content body is too short (< 50 chars)');
    }
  }

  return {
    file: filePath,
    valid: errors.length === 0,
    errors,
  };
}

// Validate all .md files in given directory
const targetDir = process.argv[2] || '.claude';
const results = [];

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.name.endsWith('.md') && !entry.name.startsWith('README')) {
      results.push(validateFile(fullPath));
    }
  }
}

walkDir(targetDir);

// Output results
let hasErrors = false;
for (const result of results) {
  if (!result.valid) {
    hasErrors = true;
    console.error(`INVALID: ${result.file}`);
    result.errors.forEach(e => console.error(`  - ${e}`));
  } else {
    console.log(`OK: ${result.file}`);
  }
}

process.exit(hasErrors ? 1 : 0);
