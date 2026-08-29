import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';

export default defineConfig({
  plugins: [sites()],
  server: {
    host: '127.0.0.1',
  },
});
