import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Only the pure core logic is unit-tested. The vscode glue in
    // src/extension.ts requires the extension host and is excluded.
    include: ['src/core/**/*.test.ts'],
  },
});
