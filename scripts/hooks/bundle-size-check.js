'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin, getEditedFilePath, pass, warn } = require('./lib/hook-utils');

const LARGE_PACKAGES = ['moment', 'lodash', 'firebase', 'aws-sdk', '@aws-sdk/client-s3', 'native-base', 'react-native-paper'];

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) pass();
if (path.basename(filePath) !== 'package.json') pass();

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const pkg = JSON.parse(content);
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const found = LARGE_PACKAGES.filter(name => name in allDeps);

  if (found.length > 0) {
    warn(
      `ERNE: Large dependencies detected: ${found.join(', ')}. ` +
      'Consider lighter alternatives (e.g., date-fns instead of moment, ' +
      'lodash-es or individual lodash methods instead of full lodash).'
    );
  } else {
    pass();
  }
} catch {
  pass();
}
