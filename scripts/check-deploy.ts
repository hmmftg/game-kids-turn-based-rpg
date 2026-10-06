/**
 * Deployment-shape gate.
 *
 * Asserts the built app is deployable from a subpath (e.g.
 * `https://host/game/`), not only from the origin root: no root-absolute
 * asset references in index.html, relative manifest URLs, a generated service
 * worker whose precache covers the shell.
 *
 * Usage: node --experimental-strip-types scripts/check-deploy.ts
 *        (run after `vite build`; respects BASE_URL via the built output)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const errors: string[] = [];

function must(cond: boolean, label: string) {
  if (!cond) errors.push(`[deploy] ${label}`);
}

const indexPath = join(DIST, 'index.html');
must(existsSync(indexPath), 'dist/index.html missing — run the build first');
const index = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';

// Root-absolute refs (`src="/..."`, `href="/..."`) break subpath deploys.
// Vite emits base-relative refs; anything hardcoded to `/` is a regression.
const rootAbsolute = index.match(/(?:src|href)="\//g) ?? [];
must(
  rootAbsolute.length === 0,
  `index.html has ${rootAbsolute.length} root-absolute asset ref(s): ${[...new Set(index.match(/(?:src|href)="\/?[^"]*"/g) ?? [])].slice(0, 5).join(', ')}`,
);

const manifestPath = join(DIST, 'manifest.webmanifest');
must(existsSync(manifestPath), 'dist/manifest.webmanifest missing');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    start_url?: string;
    scope?: string;
    icons?: Array<{ src?: string }>;
  };
  const urls = [
    manifest.start_url ?? '',
    manifest.scope ?? '',
    ...(manifest.icons ?? []).map((icon) => icon.src ?? ''),
  ];
  for (const url of urls) {
    if (url === '') continue;
    const rootAbsolute = url.startsWith('/');
    const absoluteScheme = /^[a-z][a-z0-9+.-]*:/i.test(url);
    must(
      !rootAbsolute && !absoluteScheme,
      `manifest URL is not relative: "${url}" — a subpath deploy would fetch it from the origin root`,
    );
  }
}

const swPath = join(DIST, 'sw.js');
must(existsSync(swPath), 'dist/sw.js missing — precaching service worker was not generated');
if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8');
  must(
    sw.includes('index.html'),
    'sw.js precache does not include index.html (offline cold start would fail)',
  );
  must(sw.includes('manifest.webmanifest'), 'sw.js precache does not include the manifest');
  must(!sw.includes('navigateFallback"),"'), 'sw.js navigateFallback misconfigured');
}

must(existsSync(join(DIST, 'offline.html')), 'dist/offline.html missing');
must(existsSync(join(DIST, 'audio/music-hub.wav')), 'dist/audio missing — audio must be precached');

for (const error of errors) process.stderr.write(`error  ${error}\n`);
if (errors.length > 0) {
  process.stderr.write(`\n${errors.length} deploy-shape error(s).\n`);
  process.exit(1);
}
process.stdout.write('deploy shape: subpath-safe refs, relative manifest, SW precache ok\n');
