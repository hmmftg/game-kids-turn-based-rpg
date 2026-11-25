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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isForbiddenDeployArtifact } from './deploy-artifacts.ts';

const DIST = join(process.cwd(), 'dist');
const errors: string[] = [];

function walkFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    if (statSync(absolute).isDirectory()) files.push(...walkFiles(absolute));
    else files.push(absolute);
  }
  return files;
}

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
  // The ?perfprobe=1 measurement chunk is dynamically imported on demand and
  // must never land in the precache — globIgnores keeps the profiling path at
  // zero install cost. Verified against the generated manifest, not config.
  must(
    !sw.includes('perfProbe'),
    'sw.js precache includes the perfProbe chunk — profiling must cost the PWA nothing',
  );
  must(
    !/["'][^"']+\.map["']/.test(sw),
    'sw.js precache includes a source-map URL — maps must never be precached',
  );
  must(
    sw.includes('models/'),
    'sw.js precache does not include models/*.glb — GLB landmarks would fail offline',
  );
  // examples/* build with their own Vite config into their own dist — they
  // must never reach the game's bundle budget or precache manifest. Verified
  // against the built output, not the config.
  must(
    !sw.includes('hello-world') && !sw.includes('examples/'),
    'sw.js precache includes example assets — examples are not part of the app bundle',
  );

  for (const file of existsSync(DIST) ? walkFiles(DIST) : []) {
    const asset = relative(DIST, file).replaceAll('\\', '/');
    if (/^models\/.*\.glb$/i.test(asset) || /^audio\/.*\.(?:mp3|ogg|wav)$/i.test(asset)) {
      must(sw.includes(asset), `sw.js precache omits offline asset ${asset}`);
    }
  }
}

const distFiles = existsSync(DIST) ? walkFiles(DIST) : [];
const relativeFiles = distFiles.map((file) => relative(DIST, file).replaceAll('\\', '/'));
const forbiddenArtifact = relativeFiles.find(isForbiddenDeployArtifact);
must(
  !forbiddenArtifact,
  `dist contains a package, declaration, tarball, example, or consumer fixture artifact: ${forbiddenArtifact}`,
);

// Vite's standard hidden-map processing must keep app maps available to the
// internal diagnostic build without advertising them from shipped scripts.
const appMapFile = relativeFiles.find((file) => /^assets\/index-.*\.js\.map$/.test(file));
must(appMapFile !== undefined, 'dist/assets is missing the hidden Vite app source map');
if (appMapFile) {
  try {
    const map = JSON.parse(readFileSync(join(DIST, appMapFile), 'utf8')) as {
      version?: number;
      sources?: string[];
      sourcesContent?: Array<string | null>;
    };
    const coreSourceIndex = map.sources?.findIndex((source) => {
      const normalized = source.replaceAll('\\', '/');
      return (
        normalized.includes('packages/core/dist/graph.js') ||
        normalized.includes('node_modules/waypoint-rpg-core/dist/graph.js')
      );
    });
    must(map.version === 3, `${appMapFile} is not a standard version 3 source map`);
    must(
      coreSourceIndex !== undefined && coreSourceIndex >= 0,
      `${appMapFile} does not map the bundled framework graph module`,
    );
    must(
      coreSourceIndex !== undefined &&
        typeof map.sourcesContent?.[coreSourceIndex] === 'string' &&
        map.sourcesContent[coreSourceIndex].includes('neighboursOf'),
      `${appMapFile} is missing embedded framework graph source content`,
    );
  } catch (error) {
    must(false, `${appMapFile} is not valid JSON: ${String(error)}`);
  }
}

for (const file of distFiles.filter((entry) => entry.endsWith('.js'))) {
  const contents = readFileSync(file, 'utf8');
  must(
    !/\/[/*]#?\s*sourceMappingURL=/.test(contents),
    `${relative(DIST, file).replaceAll('\\', '/')} advertises a source map`,
  );
}

must(existsSync(join(DIST, 'offline.html')), 'dist/offline.html missing');
must(existsSync(join(DIST, 'audio/music-hub.mp3')), 'dist/audio missing — audio must be precached');

for (const error of errors) process.stderr.write(`error  ${error}\n`);
if (errors.length > 0) {
  process.stderr.write(`\n${errors.length} deploy-shape error(s).\n`);
  process.exit(1);
}
process.stdout.write('deploy shape: subpath-safe refs, relative manifest, SW precache ok\n');
