'use strict';

const fs = require('fs');
const path = require('path');

/**
 * scanRoutes(cwd) — Scan Expo Router file-based routing in app/ directory.
 * Returns { routes[], dynamicRoutes[], layouts[], totalRoutes }.
 */
function scanRoutes(cwd) {
  const result = { routes: [], dynamicRoutes: [], layouts: [], totalRoutes: 0 };
  const appDir = fs.existsSync(path.join(cwd, 'app'))
    ? path.join(cwd, 'app')
    : fs.existsSync(path.join(cwd, 'src', 'app'))
      ? path.join(cwd, 'src', 'app')
      : null;

  if (!appDir) {
    return result;
  }

  const routeFiles = collectRouteFiles(appDir);

  for (const file of routeFiles) {
    const relativePath = path.relative(appDir, file);
    const routePath = fileToRoutePath(relativePath);
    const params = extractDynamicParams(relativePath);
    const isDynamic = params.length > 0;
    const isLayout = path.basename(file).startsWith('_layout');
    const hasLayout = checkHasLayout(file, appDir);

    const route = {
      path: routePath,
      file: path.relative(cwd, file),
      isDynamic,
      params,
      hasLayout,
    };

    result.routes.push(route);

    if (isDynamic) {
      result.dynamicRoutes.push(route);
    }

    if (isLayout) {
      result.layouts.push(route);
    }
  }

  result.totalRoutes = result.routes.length;
  return result;
}

/**
 * Recursively collect .tsx/.ts/.js files from app/ directory.
 */
function collectRouteFiles(dir) {
  const files = [];
  let entries;

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(fullPath));
    } else if (/\.(tsx?|js)$/.test(entry.name) && !entry.name.startsWith('.')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Convert a file path relative to app/ into a route path.
 * e.g. (tabs)/home.tsx → /(tabs)/home
 *      [id].tsx → /[id]
 *      index.tsx → /
 */
function fileToRoutePath(relativePath) {
  let route = relativePath
    .replace(/\.(tsx?|js)$/, '')    // strip extension
    .replace(/\\/g, '/');           // normalize separators

  // index files resolve to their parent
  if (route === 'index') {
    return '/';
  }
  if (route.endsWith('/index')) {
    route = route.slice(0, -'/index'.length);
  }

  return '/' + route;
}

/**
 * Extract dynamic [param] segments from a file path.
 */
function extractDynamicParams(relativePath) {
  const params = [];
  const matches = relativePath.match(/\[([^\]]+)\]/g);

  if (matches) {
    for (const m of matches) {
      params.push(m.slice(1, -1)); // strip [ ]
    }
  }

  return params;
}

/**
 * Check if the route's parent directory contains a _layout file.
 */
function checkHasLayout(filePath, appDir) {
  const dir = path.dirname(filePath);

  try {
    const entries = fs.readdirSync(dir);
    return entries.some((e) => e.startsWith('_layout'));
  } catch {
    return false;
  }
}

module.exports = scanRoutes;
