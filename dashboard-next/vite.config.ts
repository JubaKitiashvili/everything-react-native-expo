import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dashboard/public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': `http://localhost:${process.env.ERNE_DASHBOARD_PORT || '3333'}`,
    },
    // Proxy WebSocket connections to backend in dev mode
    hmr: {
      // Keep HMR on its own protocol so it doesn't conflict
    },
  },
});
