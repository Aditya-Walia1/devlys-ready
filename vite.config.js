import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';

export default defineConfig({
  plugins: [sites()],
  build: {
    outDir: 'dist/client',
  },
  server: {
    host: '127.0.0.1',
  },
});
