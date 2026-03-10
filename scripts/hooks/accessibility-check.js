'use strict';
const fs = require('fs');
const { readStdin, getEditedFilePath, pass, warn, isTestFile, hasExtension } = require('./lib/hook-utils');

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) return pass();

const JSX_EXTS = ['.jsx', '.tsx'];
if (!hasExtension(filePath, JSX_EXTS)) return pass();
if (isTestFile(filePath)) return pass();

let content;
try {
  content = fs.readFileSync(filePath, 'utf8');
} catch {
  return pass();
}

/**
 * Extract JSX opening tags for a given component name.
 * Handles brace-depth so `>` inside `() => {}` doesn't terminate the tag.
 */
function extractJsxOpenTags(src, componentName) {
  const results = [];
  let searchFrom = 0;
  const prefix = '<' + componentName;
  while (true) {
    const startIdx = src.indexOf(prefix, searchFrom);
    if (startIdx === -1) break;
    // Ensure the char after the component name is whitespace, >, or /
    const afterName = src[startIdx + prefix.length];
    if (afterName && !/[\s>/]/.test(afterName)) {
      searchFrom = startIdx + 1;
      continue;
    }
    // Scan forward to find the end of the opening tag
    let i = startIdx + 1;
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let tag = '';
    while (i < src.length) {
      const ch = src[i];
      if (inString) {
        tag += ch;
        if (ch === stringChar && src[i - 1] !== '\\') inString = false;
      } else if (ch === '{') {
        depth++;
        tag += ch;
      } else if (ch === '}') {
        depth--;
        tag += ch;
      } else if (depth === 0 && (ch === '"' || ch === "'" || ch === '`')) {
        inString = true;
        stringChar = ch;
        tag += ch;
      } else if (depth === 0 && ch === '/' && src[i + 1] === '>') {
        tag += '/>';
        i++;
        break;
      } else if (depth === 0 && ch === '>') {
        tag += ch;
        break;
      } else {
        tag += ch;
      }
      i++;
    }
    results.push('<' + tag);
    searchFrom = i + 1;
  }
  return results;
}

const issues = [];

const TOUCHABLE_COMPONENTS = [
  'TouchableOpacity', 'TouchableHighlight',
  'TouchableWithoutFeedback', 'TouchableNativeFeedback', 'Pressable',
];

for (const component of TOUCHABLE_COMPONENTS) {
  const tags = extractJsxOpenTags(content, component);
  for (const tag of tags) {
    if (/onPress|onLongPress/.test(tag)) {
      const hasLabel = /accessibilityLabel/.test(tag);
      const hasA11yHint = /accessibilityHint/.test(tag);
      if (!hasLabel && !hasA11yHint) {
        issues.push(`\`${component}\` has press handler but missing \`accessibilityLabel\``);
      }
      if (component === 'Pressable' && !/accessibilityRole|accessible/.test(tag)) {
        issues.push(`\`Pressable\` missing \`accessibilityRole\` — set to "button", "link", etc.`);
      }
    }
  }
}

const imageTags = extractJsxOpenTags(content, 'Image');
for (const tag of imageTags) {
  const hasAccessible = /accessible|accessibilityLabel|alt=/.test(tag);
  if (!hasAccessible) {
    issues.push('`Image` missing accessibility label — add `accessibilityLabel` or `accessible={false}` for decorative images');
  }
}

if (issues.length > 0) {
  const unique = [...new Set(issues)];
  const shown = unique.slice(0, 5);
  const remaining = unique.length - shown.length;
  let msg = `ERNE: Accessibility check — ${unique.length} issue(s):\n${shown.map((i) => `  - ${i}`).join('\n')}`;
  if (remaining > 0) msg += `\n  ... and ${remaining} more`;
  return warn(msg);
} else {
  return pass();
}
