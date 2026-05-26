import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Build-out phase: emit to next/dist so the legacy app/ keeps producing
// ../public and the live dashboard never breaks mid-rewrite.
// CUTOVER (Phase 5): change this to path.resolve(here, '..', 'public').
const outDir = path.resolve(here, 'dist');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
    },
  },
  server: {
    // 5174 so `npm run dev` here never clashes with the legacy app on 5173.
    port: 5174,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    cssCodeSplit: true,
    reportCompressedSize: false,
  },
});
