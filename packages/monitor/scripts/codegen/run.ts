// Entry point for `npm run codegen`. Reads src/types/events.ts and
// writes Swift + Kotlin schemas into ios/generated and android/generated.

import * as path from 'path';
import { generateSchemas } from './schema-codegen';

async function main(): Promise<void> {
  const root = path.resolve(__dirname, '../..');
  const sourceFile = path.join(root, 'src/types/events.ts');
  const iosOutDir = path.join(root, 'ios/generated');
  const androidOutDir = path.join(
    root,
    'android/src/main/java/expo/modules/ernemonitor/generated',
  );
  const result = await generateSchemas({
    sourceFile,
    iosOutDir,
    androidOutDir,
  });
  console.log(
    `[erne-monitor codegen] wrote ${Object.keys(result.swift).length} Swift file(s) and ${Object.keys(result.kotlin).length} Kotlin file(s) for ${result.discovered.length} interface(s).`,
  );
}

main().catch((err) => {
  console.error('[erne-monitor codegen] failed:', err);
  process.exit(1);
});
