/**
 * Machine-readable asset registry — every shipped binary asset must have an
 * entry here with its license provenance. `scripts/validate-assets.ts` fails
 * the build when a file under `public/` or `src/assets/` has no entry, so
 * future content cannot bypass attribution review.
 *
 * Audio assets carry their own license field in
 * `src/services/audio/manifest.ts` (AUDIO_MANIFEST) — the validator merges
 * both registries; do not duplicate audio entries here.
 *
 * `status` marks the release gate:
 * - 'licensed': final, attribution required (checked against `attribution`)
 * - 'placeholder': internally generated stand-in — legal to ship in dev,
 *   must be replaced before a content release (draft-content warnings cover
 *   the same status for copy).
 */
export interface AssetRegistryEntry {
  readonly id: string;
  /** Repo-relative file path, e.g. `public/icons/icon.svg`. */
  readonly file: string;
  readonly type: 'icon' | 'font' | 'image' | 'audio' | 'model';
  /** SPDX-style license id or a descriptive string — never empty. */
  readonly license: string;
  /** Canonical URL of the license text (deed/legalcode), when one exists. */
  readonly licenseUrl?: string;
  /** Attribution line shown if the license requires one (empty = not required). */
  readonly attribution: string;
  /** Where the asset came from — URL, generator, or author. For converted
      sources, include the upstream package id/version and original path. */
  readonly source: string;
  /** SHA-256 of the shipped file — the validator verifies it when present. */
  readonly sha256?: string;
  readonly status: 'licensed' | 'placeholder';
}

export const ASSET_REGISTRY: readonly AssetRegistryEntry[] = [
  {
    id: 'icon-app',
    file: 'public/icons/icon.svg',
    type: 'icon',
    license: 'generated-local-placeholder',
    attribution: '',
    source: 'generated locally for this project',
    status: 'placeholder',
  },
  {
    id: 'icon-app-maskable',
    file: 'public/icons/icon-maskable.svg',
    type: 'icon',
    license: 'generated-local-placeholder',
    attribution: '',
    source: 'generated locally for this project',
    status: 'placeholder',
  },
  {
    id: 'icon-192',
    file: 'public/icons/icon-192.png',
    type: 'icon',
    license: 'generated-local-placeholder',
    attribution: '',
    source: 'rendered from icons/icon.svg',
    status: 'placeholder',
  },
  {
    id: 'icon-512',
    file: 'public/icons/icon-512.png',
    type: 'icon',
    license: 'generated-local-placeholder',
    attribution: '',
    source: 'rendered from icons/icon.svg',
    status: 'placeholder',
  },
  {
    id: 'icon-maskable-512',
    file: 'public/icons/icon-maskable-512.png',
    type: 'icon',
    license: 'generated-local-placeholder',
    attribution: '',
    source: 'rendered from icons/icon-maskable.svg',
    status: 'placeholder',
  },
  {
    id: 'font-vazirmatn-regular',
    file: 'src/assets/fonts/vazirmatn-Regular-subset.woff2',
    type: 'font',
    license: 'OFL-1.1',
    attribution: 'Vazirmatn — Saber Rastikerdar, SIL Open Font License 1.1',
    source: 'https://github.com/rastikerdar/vazirmatn (subset, Persian glyphs)',
    status: 'licensed',
  },
  {
    id: 'font-vazirmatn-bold',
    file: 'src/assets/fonts/vazirmatn-Bold-subset.woff2',
    type: 'font',
    license: 'OFL-1.1',
    attribution: 'Vazirmatn — Saber Rastikerdar, SIL Open Font License 1.1',
    source: 'https://github.com/rastikerdar/vazirmatn (subset, Persian glyphs)',
    status: 'licensed',
  },
  {
    id: 'model-home-gate',
    file: 'public/models/home-gate.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Medieval Builder Pack — Kay Lousberg, CC0',
    source:
      'KayKit Medieval Builder Pack 1.0 (Kay Lousberg, kaylousberg.com) — Models/objects/gltf/house.gltf.glb, decimated @gltf-transform/cli 4.5.1 (ratio 0.4, error 0.01) to fit render budgets',
    sha256: '82016c029b24e6fbb2e8271a51ad47de4ac85c2702bbaa0d22e9f53fe343fb56',
    status: 'licensed',
  },
  {
    id: 'model-shop',
    file: 'public/models/shop.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Medieval Builder Pack — Kay Lousberg, CC0',
    source:
      'KayKit Medieval Builder Pack 1.0 (Kay Lousberg, kaylousberg.com) — Models/objects/gltf/market.gltf.glb, decimated @gltf-transform/cli 4.5.1 (ratio 0.4, error 0.01) to fit render budgets',
    sha256: '1992dd7d9caf60cbc9525d5016919d1cd8b6c85e3e0a7f7a99645fe9adc60fe7',
    status: 'licensed',
  },
  {
    id: 'model-fountain',
    file: 'public/models/fountain.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Medieval Builder Pack — Kay Lousberg, CC0',
    source:
      'KayKit Medieval Builder Pack 1.0 (Kay Lousberg, kaylousberg.com) — Models/objects/gltf/well.gltf.glb, decimated @gltf-transform/cli 4.5.1 (ratio 0.4, error 0.01) to fit render budgets',
    sha256: 'a851a6245a957efc66ea8a84414c9586b2940d915090caca52e8edda014e526f',
    status: 'licensed',
  },
];
