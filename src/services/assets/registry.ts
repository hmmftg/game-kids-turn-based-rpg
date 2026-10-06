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
  readonly type: 'icon' | 'font' | 'image' | 'audio';
  /** SPDX-style license id or a descriptive string — never empty. */
  readonly license: string;
  /** Attribution line shown if the license requires one (empty = not required). */
  readonly attribution: string;
  /** Where the asset came from — URL, generator, or author. */
  readonly source: string;
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
];
