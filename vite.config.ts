import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Offline-first, same-origin only. No CDN, analytics or remote font is allowed at runtime.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: false,
      includeAssets: ['icons/*.svg', 'offline.html'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest,json,mp3,ogg}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/offline\.html$/],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          /node_modules[\\/](three|@react-three)[\\/]/.test(id) ? 'three' : undefined,
      },
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
