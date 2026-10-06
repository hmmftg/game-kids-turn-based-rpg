/**
 * Asset provenance gate.
 *
 * Every binary asset the game ships — audio under `public/audio/`, icons under
 * `public/icons/`, fonts under `src/assets/fonts/` — must be declared in a
 * license registry (`ASSET_REGISTRY` for icons/fonts, `AUDIO_MANIFEST` for
 * audio). An undeclared file or an empty license fails the build, so new
 * content cannot bypass attribution review.
 *
 * Usage: node --experimental-strip-types scripts/validate-assets.ts
 *        [--release]  (release mode fails on placeholder assets)
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIO_MANIFEST } from '../src/services/audio/manifest.ts';
import { ASSET_REGISTRY } from '../src/services/assets/registry.ts';

const release = process.argv.includes('--release');
const ROOT = process.cwd();

interface KnownAsset {
  readonly file: string; // repo-relative, forward slashes
  readonly license: string;
  readonly attribution: string;
  readonly status: 'licensed' | 'placeholder';
  readonly where: string;
}

// Slots with `url: null` are intentionally silent — no file to declare.
const audioAssets: readonly KnownAsset[] = AUDIO_MANIFEST.filter((asset) => asset.url !== null).map(
  (asset) => ({
    file: `public/${(asset.url as string).replace(/^\.\//, '')}`,
    license: asset.licence,
    attribution: '',
    status: 'placeholder',
    where: `AUDIO_MANIFEST:${asset.id}`,
  }),
);

const registryAssets: readonly KnownAsset[] = ASSET_REGISTRY.map((entry) => ({
  file: entry.file,
  license: entry.license,
  attribution: entry.attribution,
  status: entry.status,
  where: `ASSET_REGISTRY:${entry.id}`,
}));

const known = new Map<string, KnownAsset>();
for (const asset of [...audioAssets, ...registryAssets]) {
  if (known.has(asset.file)) {
    process.stderr.write(`error [asset-registry] ${asset.file} declared twice\n`);
    process.exit(1);
  }
  known.set(asset.file, asset);
}

const errors: string[] = [];
const warnings: string[] = [];

// Every declared file must exist; every declared license must be non-empty.
for (const asset of known.values()) {
  if (!existsSync(join(ROOT, asset.file))) {
    errors.push(`[asset-registry] ${asset.where} declares missing file ${asset.file}`);
  }
  if (asset.license.trim() === '') {
    errors.push(`[asset-registry] ${asset.where} has an empty license`);
  }
  if (release && asset.status === 'placeholder') {
    errors.push(
      `[asset-registry] ${asset.where} is placeholder — replace before a content release`,
    );
  }
  if (!release && asset.status === 'placeholder') {
    warnings.push(`[draft-asset] ${asset.where} (${asset.file}) is placeholder`);
  }
}

// Every shipped binary file must be declared.
const coveredDirs: Array<{ dir: string; exts: readonly string[] }> = [
  { dir: 'public/audio', exts: ['.wav', '.mp3', '.ogg'] },
  { dir: 'public/icons', exts: ['.svg', '.png', '.ico'] },
  { dir: 'src/assets/fonts', exts: ['.woff2', '.woff', '.ttf', '.otf'] },
];
for (const { dir, exts } of coveredDirs) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const name of readdirSync(abs)) {
    if (!exts.some((ext) => name.endsWith(ext))) continue;
    const file = `${dir}/${name}`;
    if (!known.has(file)) {
      errors.push(
        `[asset-registry] ${file} ships without a license entry — add it to ASSET_REGISTRY or AUDIO_MANIFEST`,
      );
    }
  }
}

for (const warning of warnings) process.stderr.write(`warn   ${warning}\n`);
for (const error of errors) process.stderr.write(`error  ${error}\n`);

if (errors.length > 0) {
  process.stderr.write(`\n${errors.length} asset-registry error(s).\n`);
  process.exit(1);
}
process.stdout.write(
  `asset registry: ${known.size} declared, ${warnings.length} placeholder warning(s)\n`,
);
