'use strict';

const fs = require('fs');
const path = require('path');

const MAX_HOOKS = 100;

/**
 * scanHooks(cwd, sourceFiles) — Detect exported custom hooks (use* functions).
 * Returns { hooks[] }.
 */
function scanHooks(cwd, sourceFiles) {
  const result = { hooks: [] };

  if (!sourceFiles || sourceFiles.length === 0) {
    return result;
  }

  // Phase 1: Detect hooks
  for (const file of sourceFiles) {
    if (result.hooks.length >= MAX_HOOKS) break;

    const content = safeReadFile(file);
    if (!content) continue;

    const hooks = detectHooks(file, content, cwd);
    for (const hook of hooks) {
      if (result.hooks.length >= MAX_HOOKS) break;
      result.hooks.push(hook);
    }
  }

  // Phase 2: Find consumers
  for (const hook of result.hooks) {
    hook.consumers = findConsumers(hook.name, hook.file, sourceFiles, cwd);
  }

  return result;
}

/**
 * Detect exported functions starting with 'use'.
 */
function detectHooks(file, content, cwd) {
  const hooks = [];
  const regex = /export\s+(?:const|function)\s+(use\w+)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const params = extractParams(content, name);
    const returnHint = extractReturnHint(content, name);

    hooks.push({
      name,
      file: path.relative(cwd, file),
      params,
      returnHint,
      consumers: [], // filled in phase 2
    });
  }

  return hooks;
}

/**
 * Extract parameter list from the hook's function signature.
 */
function extractParams(content, hookName) {
  // Match: export const useFoo = (params) => or export function useFoo(params)
  const arrowMatch = content.match(
    new RegExp(`export\\s+const\\s+${hookName}\\s*=\\s*\\(([^)]*)\\)`)
  );
  if (arrowMatch) {
    return cleanParams(arrowMatch[1]);
  }

  const funcMatch = content.match(
    new RegExp(`export\\s+function\\s+${hookName}\\s*\\(([^)]*)\\)`)
  );
  if (funcMatch) {
    return cleanParams(funcMatch[1]);
  }

  return '';
}

/**
 * Clean and normalize a parameter string.
 */
function cleanParams(raw) {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove block comments
    .replace(/\/\/.*/g, '')            // remove line comments
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();
}

/**
 * Try to extract a return type hint from the hook.
 */
function extractReturnHint(content, hookName) {
  // Check for explicit return type annotation: ): ReturnType
  const typeMatch = content.match(
    new RegExp(`${hookName}[^)]*\\)\\s*:\\s*([^{=]+)`)
  );
  if (typeMatch) {
    const hint = typeMatch[1].trim().replace(/\s*=>.*/, '').trim();
    if (hint && hint.length < 80) {
      return hint;
    }
  }

  // Fallback: look for return statement pattern
  return '';
}

/**
 * Find files that import this hook.
 */
function findConsumers(hookName, hookRelFile, sourceFiles, cwd) {
  const consumers = [];
  const importRegex = new RegExp(`import\\s+.*\\b${hookName}\\b`);

  for (const file of sourceFiles) {
    const relFile = path.relative(cwd, file);
    if (relFile === hookRelFile) continue;

    const content = safeReadFile(file);
    if (!content) continue;

    if (importRegex.test(content)) {
      consumers.push(relFile);
    }
  }

  return consumers;
}

/**
 * Safely read a file, returning null on error.
 */
function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

module.exports = scanHooks;
