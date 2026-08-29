import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'vite';

await build();
await mkdir('dist/server', { recursive: true });
await copyFile('worker/index.js', 'dist/server/index.js');
