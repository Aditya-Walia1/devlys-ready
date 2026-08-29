import { copyFile, mkdir, rm } from 'node:fs/promises';
import { build } from 'vite';

await rm('dist', { recursive: true, force: true });
await build();
await mkdir('dist/server', { recursive: true });
await copyFile('worker/index.js', 'dist/server/index.js');
