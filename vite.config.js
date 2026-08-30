import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [sites()],
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        review: resolve(import.meta.dirname, 'review.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
  },
});
