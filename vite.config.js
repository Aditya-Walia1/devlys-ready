import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';
import { resolve } from 'node:path';
import { devReviewApi } from './scripts/dev-review-api.mjs';

export default defineConfig({
  plugins: [sites(), devReviewApi()],
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        review: resolve(import.meta.dirname, 'review.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html'),
        enroll: resolve(import.meta.dirname, 'enroll.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
  },
});
