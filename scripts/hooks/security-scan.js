'use strict';
const fs = require('fs');
const { readStdin, getEditedFilePath, pass, warn, hasExtension } = require('./lib/hook-utils');

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) pass();

const JS_TS_EXTS = ['.js', '.jsx', '.ts', '.tsx'];
if (!hasExtension(filePath, JS_TS_EXTS)) pass();

let content;
try {
  content = fs.readFileSync(filePath, 'utf8');
} catch {
  pass();
}

const issues = [];

const SECRET_PATTERNS = [
  { pattern: /(['"`])sk-[a-zA-Z0-9]{20,}\1/, label: 'Possible hardcoded API secret key' },
  { pattern: /(['"`])AIza[a-zA-Z0-9_-]{35}\1/, label: 'Possible hardcoded Google API key' },
  { pattern: /(['"`])(ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}\1/, label: 'Possible hardcoded GitHub token' },
  { pattern: /(['"`])xox[bpras]-[a-zA-Z0-9-]{10,}\1/, label: 'Possible hardcoded Slack token' },
  { pattern: /\b(password|secret|apikey|api_key)\s*[:=]\s*(['"`])[^'"]{8,}\2/i, label: 'Possible hardcoded secret or password' },
];

for (const { pattern, label } of SECRET_PATTERNS) {
  if (pattern.test(content)) {
    issues.push(label);
  }
}

if (/\beval\s*\(/.test(content)) {
  issues.push('unsafe `eval()` usage detected');
}

if (/new\s+Function\s*\(/.test(content)) {
  issues.push('unsafe `new Function()` usage detected');
}

if (/innerHTML\s*=/.test(content) && !content.includes('dangerouslySetInnerHTML')) {
  issues.push('Direct innerHTML assignment — potential XSS');
}

if (/Linking\.openURL\s*\(/.test(content)) {
  const hasValidation = /url\.startsWith|url\.match|isValidUrl|validateUrl|allowedSchemes/i.test(content);
  if (!hasValidation) {
    issues.push('Unvalidated deep link `Linking.openURL()` — validate URL scheme before opening');
  }
}

if (/WebView/.test(content) && /javaScriptEnabled/.test(content)) {
  if (!/originWhitelist/.test(content)) {
    issues.push('WebView with JS enabled but no `originWhitelist` — restrict allowed origins');
  }
}

if (issues.length > 0) {
  warn(`ERNE: Security scan found ${issues.length} issue(s):\n${issues.map((i) => `  - ${i}`).join('\n')}`);
} else {
  pass();
}
