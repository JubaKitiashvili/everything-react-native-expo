'use strict';

const fs = require('fs');
const path = require('path');

const MAX_COMPONENTS = 200;
const MAX_USAGES = 3;

/**
 * scanComponents(cwd, sourceFiles) — Detect exported components that return JSX.
 * Returns { components[] }.
 */
function scanComponents(cwd, sourceFiles) {
  const result = { components: [] };

  if (!sourceFiles || sourceFiles.length === 0) {
    return result;
  }

  // Phase 1: Detect components in each source file
  for (const file of sourceFiles) {
    if (result.components.length >= MAX_COMPONENTS) break;

    const content = safeReadFile(file);
    if (!content) continue;

    const components = detectComponents(file, content, cwd);
    for (const comp of components) {
      if (result.components.length >= MAX_COMPONENTS) break;
      result.components.push(comp);
    }
  }

  // Phase 2: Find usages across source files
  for (const comp of result.components) {
    comp.usages = findUsages(comp.name, comp.file, sourceFiles, cwd);
  }

  return result;
}

/**
 * Detect exported components in a file that return JSX.
 */
function detectComponents(file, content, cwd) {
  const components = [];
  const lines = content.split('\n');
  const lineCount = lines.length;

  // Match: export const Name = or export function Name
  const exportRegex = /export\s+(?:const|function)\s+([A-Z]\w*)/g;
  let match;

  while ((match = exportRegex.exec(content)) !== null) {
    const name = match[1];

    // Check if the file has JSX return somewhere
    if (!/return\s*\([\s\S]*</.test(content) && !/return\s*</.test(content)) {
      continue;
    }

    const exports = extractExports(content);
    const props = extractProps(content, name);

    components.push({
      name,
      file: path.relative(cwd, file),
      lineCount,
      exports,
      props,
      usages: [], // filled in phase 2
    });
  }

  return components;
}

/**
 * Extract all named exports from file content.
 */
function extractExports(content) {
  const exports = [];
  const regex = /export\s+(?:const|function|type|interface)\s+(\w+)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    exports.push(match[1]);
  }

  return exports;
}

/**
 * Extract prop names from interface/type XProps definitions.
 */
function extractProps(content, componentName) {
  const props = [];

  // Try: interface XProps { ... } or type XProps = { ... }
  const propsPattern = new RegExp(
    `(?:interface|type)\\s+${componentName}Props\\s*(?:=\\s*)?\\{([^}]*)\\}`,
    's'
  );
  const match = content.match(propsPattern);

  if (!match) {
    // Also try generic Props pattern if only one component in file
    const genericMatch = content.match(
      /(?:interface|type)\s+Props\s*(?:=\s*)?\{([^}]*)\}/s
    );
    if (genericMatch) {
      return extractPropNames(genericMatch[1]);
    }
    return props;
  }

  return extractPropNames(match[1]);
}

/**
 * Extract property names from the body of a Props interface/type.
 */
function extractPropNames(body) {
  const props = [];
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    // Match: propName: or propName?:
    const propMatch = trimmed.match(/^(\w+)\??\s*:/);
    if (propMatch) {
      props.push(propMatch[1]);
    }
  }

  return props;
}

/**
 * Find up to MAX_USAGES JSX usages of a component across source files.
 */
function findUsages(componentName, componentRelFile, sourceFiles, cwd) {
  const usages = [];
  const importRegex = new RegExp(`import\\s+.*\\b${componentName}\\b`);
  const jsxRegex = new RegExp(`<${componentName}[\\s/>]`);

  for (const file of sourceFiles) {
    if (usages.length >= MAX_USAGES) break;

    const relFile = path.relative(cwd, file);
    // Skip the component's own file
    if (relFile === componentRelFile) continue;

    const content = safeReadFile(file);
    if (!content) continue;

    // Must import the component
    if (!importRegex.test(content)) continue;

    // Find JSX usage lines
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (usages.length >= MAX_USAGES) break;

      if (jsxRegex.test(lines[i])) {
        usages.push({
          file: relFile,
          line: i + 1,
          text: lines[i].trim(),
        });
      }
    }
  }

  return usages;
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

module.exports = scanComponents;
