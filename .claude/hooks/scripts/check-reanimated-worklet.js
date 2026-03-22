'use strict';
const fs = require('fs');
const { readStdin, getEditedFilePath, pass, warn, hasExtension } = require('./lib/hook-utils');

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) return pass();
if (!hasExtension(filePath, CODE_EXTENSIONS)) return pass();

try {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('react-native-reanimated')) return pass();

  const WORKLET_HOOKS = [
    'useAnimatedStyle',
    'useAnimatedGestureHandler',
    'useAnimatedScrollHandler',
    'useDerivedValue',
    'useAnimatedReaction',
  ];

  // Extract the callback bodies passed to Reanimated worklet hooks
  // and check only those for .current access
  const warnings = [];

  for (const hookName of WORKLET_HOOKS) {
    const hookRegex = new RegExp(hookName + '\\s*\\(', 'g');
    let match;
    while ((match = hookRegex.exec(content)) !== null) {
      // Find the matching callback body by tracking parens/braces
      const startIdx = match.index + match[0].length;
      let depth = 1; // we are past the opening (
      let braceDepth = 0;
      let callbackBody = '';
      let inCallback = false;
      let i = startIdx;

      // Skip to the callback function body (arrow or regular)
      while (i < content.length && depth > 0) {
        const ch = content[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === '{') {
          braceDepth++;
          inCallback = true;
        } else if (ch === '}') {
          braceDepth--;
        }

        if (inCallback) {
          callbackBody += ch;
        }

        if (inCallback && braceDepth === 0) break;
        i++;
      }

      // Check if .current is accessed inside the worklet callback
      if (callbackBody && /\.current\b/.test(callbackBody)) {
        warnings.push(hookName);
        break; // one warning per hook type is enough
      }
    }
  }

  if (warnings.length > 0) {
    return warn(
      'ERNE: Possible non-serializable `.current` access inside Reanimated worklet (' +
      warnings.join(', ') + '). ' +
      'Refs cannot be accessed inside worklet callbacks. ' +
      'Use shared values instead.'
    );
  } else {
    return pass();
  }
} catch {
  return pass();
}
