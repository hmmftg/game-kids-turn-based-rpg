import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const APP_VERSION =
  (
    JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
      version?: string;
    }
  ).version ?? '0.0.0';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { DEFAULT_RESEARCH_API_URL } from './src/services/research/defaultEndpoint.ts';

// Offline-first, same-origin only. No CDN, analytics or remote font is allowed at runtime.
// The ONE sanctioned exception: the PocketBase research endpoint — its
// ORIGIN (VITE_RESEARCH_API_URL at build time, else the built-in default)
// is added to connect-src. Nothing else may reach the network.
const researchCspPlugin = (mode: string): Plugin => ({
  name: 'research-csp',
  transformIndexHtml(html) {
    const endpoint =
      loadEnv(mode, process.cwd(), 'VITE_RESEARCH_API_URL').VITE_RESEARCH_API_URL?.trim() ||
      DEFAULT_RESEARCH_API_URL;
    // A bare host is a common Actions-Variable typo — assume https. Anything
    // still malformed fails the build loudly, with the value quoted.
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`;
    let origin: string;
    try {
      origin = new URL(candidate).origin;
    } catch {
      throw new Error(`VITE_RESEARCH_API_URL is not a valid URL: ${JSON.stringify(endpoint)}`);
    }
    return html.replace("connect-src 'self'", `connect-src 'self' ${origin}`);
  },
});

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __BUILD_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    researchCspPlugin(mode),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: false,
      includeAssets: ['icons/*.svg', 'offline.html'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest,json,mp3,ogg,wav}'],
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
    // Hidden sourcemaps: emitted for error-reporting tooling but not
    // advertised via sourceMappingURL — no accidental prod exposure,
    // and check-budgets already excludes .map from the transfer count.
    sourcemap: 'hidden',
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
}));
