import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Standalone example build — deliberately NOT part of the game's Vite config:
 * no PWA plugin, no shared chunks, its own dist inside examples/hello-world
 * (gitignored). The game bundle can never contain it, which is what makes the
 * "absent from budget and precache" checks meaningful rather than assumed.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
