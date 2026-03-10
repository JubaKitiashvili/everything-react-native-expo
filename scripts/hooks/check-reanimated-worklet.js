'use strict';
const fs = require('fs');
const { readStdin, getEditedFilePath, pass, warn, hasExtension } = require('./lib/hook-utils');

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) pass();
if (!hasExtension(filePath, CODE_EXTENSIONS)) pass();

try {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('react-native-reanimated')) pass();

  const workletPatterns = [
    /useAnimatedStyle\s*\(/,
    /useAnimatedGestureHandler\s*\(/,
    /useAnimatedScrollHandler\s*\(/,
    /useDerivedValue\s*\(/,
    /useAnimatedReaction\s*\(/,
  ];

  const hasWorklet = workletPatterns.some(p => p.test(content));
  if (!hasWorklet) pass();

  const dangerousPatterns = [
    /\.current\b/,
    /React\.createRef/,
    /useRef\s*\(/,
  ];

  const warnings = [];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      warnings.push(pattern.source);
    }
  }

  if (warnings.length > 0) {
    warn(
      'ERNE: Possible non-serializable reference in Reanimated worklet. ' +
      'Refs and non-primitive objects cannot be accessed inside worklet callbacks. ' +
      'Use shared values instead.'
    );
  } else {
    pass();
  }
} catch {
  pass();
}
