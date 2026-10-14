/**
 * Asset provenance gate.
 *
 * Every binary asset the game ships — audio under `public/audio/`, icons under
 * `public/icons/`, models under `public/models/`, fonts under
 * `src/assets/fonts/` — must be declared in a license registry
 * (`ASSET_REGISTRY` for icons/fonts/models, `AUDIO_MANIFEST` for audio).
 * An undeclared file or an empty license fails the build, so new content
 * cannot bypass attribution review. Entries that record a `sha256` get the
 * shipped file's hash verified too.
 *
 * Usage: node --experimental-strip-types scripts/validate-assets.ts
 *        [--release]  (release mode fails on placeholder assets)
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  readonly sha256?: string;
  readonly where: string;
}

// Slots with `url: null` are intentionally silent — no file to declare.
// Audio status derives from the manifest licence: placeholder licences fail
// release mode; CC-BY entries must carry a non-empty attribution line.
const audioAssets: readonly KnownAsset[] = AUDIO_MANIFEST.filter((asset) => asset.url !== null).map(
  (asset) => ({
    file: `public/${(asset.url as string).replace(/^\.\//, '')}`,
    license: asset.licence,
    attribution: asset.attribution,
    status: asset.licence.includes('placeholder')
      ? ('placeholder' as const)
      : ('licensed' as const),
    where: `AUDIO_MANIFEST:${asset.id}`,
  }),
);

const registryAssets: readonly KnownAsset[] = ASSET_REGISTRY.map((entry) => ({
  file: entry.file,
  license: entry.license,
  attribution: entry.attribution,
  status: entry.status,
  sha256: entry.sha256,
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
  } else if (asset.sha256) {
    // Integrity check: a recorded hash proves the shipped file is the
    // licensed upstream artifact, not a silently swapped binary.
    const digest = createHash('sha256')
      .update(readFileSync(join(ROOT, asset.file)))
      .digest('hex');
    if (digest !== asset.sha256) {
      errors.push(
        `[asset-registry] ${asset.where} sha256 mismatch for ${asset.file} — recorded ${asset.sha256}, file ${digest}`,
      );
    }
  }
  if (asset.license.trim() === '') {
    errors.push(`[asset-registry] ${asset.where} has an empty license`);
  }
  if (asset.license.startsWith('CC-BY') && asset.attribution.trim() === '') {
    errors.push(`[asset-registry] ${asset.where} is CC-BY but has no attribution line`);
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
  { dir: 'public/models', exts: ['.glb', '.gltf', '.bin'] },
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
