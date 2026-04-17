const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

// Metro config for the minimal demo. Because the demo lives inside the
// monitor package itself, we need Metro to resolve `@erne/monitor` to
// the sibling `packages/monitor` workspace instead of node_modules.
// The watchFolders + extraNodeModules pattern mirrors what a monorepo
// consumer would configure.
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
