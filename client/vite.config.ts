import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: ['..']
    },
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true
      }
    }
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared/src', import.meta.url))
    }
  },
  build: {
    outDir: '../server/public',
    emptyOutDir: true
  }
});
