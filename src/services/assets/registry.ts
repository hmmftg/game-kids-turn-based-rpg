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
  {
    id: 'model-ball',
    file: 'public/models/ball.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Mini-Game Variety Pack — Kay Lousberg, CC0',
    source:
      'KayKit Mini-Game Variety Pack 1.2 (Kay Lousberg, kaylousberg.com) — Models/gltf/ball.gltf.glb, simplified scripts/convert-model.ts (ratio 0.3, error 0.08)',
    sha256: 'ae48dd7551f6d698eeda8ca80aae1029d6a4e7c757ac5007d85e1fa92d9d2f4d',
    status: 'licensed',
  },
  {
    id: 'model-crate',
    file: 'public/models/crate.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit City Builder Bits — Kay Lousberg, CC0',
    source:
      'KayKit City Builder Bits 1.0 FREE (Kay Lousberg, kaylousberg.com) — Assets/gltf/box_A.gltf, texture stripped and flattened to wood tone by scripts/convert-model.ts',
    sha256: '403503a0e262188dde422383160e9fa9438dc00f8dde0d30dd6a3a8d105ba11f',
    status: 'licensed',
  },
  {
    id: 'model-duck',
    file: 'public/models/duck.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Mini-Game Variety Pack — Kay Lousberg, CC0',
    source:
      'KayKit Mini-Game Variety Pack 1.2 (Kay Lousberg, kaylousberg.com) — Models/Characters/Duck/gltf/character_duck.gltf, simplified scripts/convert-model.ts (ratio 0.35, error 0.03)',
    sha256: '45c34c23641f507a049e782da28928b9d6a088c43a2752f6fdb1c71afc7c56c8',
    status: 'licensed',
  },
  {
    id: 'model-dog',
    file: 'public/models/dog.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Mini-Game Variety Pack — Kay Lousberg, CC0',
    source:
      'KayKit Mini-Game Variety Pack 1.2 (Kay Lousberg, kaylousberg.com) — Models/Characters/Dog/gltf/character_dog.gltf, simplified scripts/convert-model.ts (ratio 0.35, error 0.03)',
    sha256: '641665a1483b75837eb3a1cb2d8225eb3b9979b6d479c736ec48fb5e676102e5',
    status: 'licensed',
  },
  {
    id: 'model-tree-a',
    file: 'public/models/tree-a.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Medieval Builder Pack — Kay Lousberg, CC0',
    source:
      'KayKit Medieval Builder Pack 1.0 (Kay Lousberg, kaylousberg.com) — Models/objects/gltf/detail_treeA.gltf.glb, simplified scripts/convert-model.ts (ratio 0.55, error 0.05)',
    sha256: 'c3b5026c8d2357cd78c6a343ae603bed6b5b60cebc5085abe9a57fa710d125fe',
    status: 'licensed',
  },
  {
    id: 'model-tree-b',
    file: 'public/models/tree-b.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Medieval Builder Pack — Kay Lousberg, CC0',
    source:
      'KayKit Medieval Builder Pack 1.0 (Kay Lousberg, kaylousberg.com) — Models/objects/gltf/detail_treeB.gltf.glb, simplified scripts/convert-model.ts (ratio 0.55, error 0.05)',
    sha256: '71a759510d92714fa1ac75f683cc87a6d0be6859dc091a04f8e5cd2fd2cd985c',
    status: 'licensed',
  },
  {
    id: 'model-tree-c',
    file: 'public/models/tree-c.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Medieval Builder Pack — Kay Lousberg, CC0',
    source:
      'KayKit Medieval Builder Pack 1.0 (Kay Lousberg, kaylousberg.com) — Models/objects/gltf/detail_treeC.gltf.glb, simplified scripts/convert-model.ts (ratio 0.55, error 0.05)',
    sha256: '1ea7f5ed073460d7d2e109444b761104bf4bb37c179afce6d2ef9810ebc50954',
    status: 'licensed',
  },
  {
    id: 'model-rocks',
    file: 'public/models/rocks.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Medieval Builder Pack — Kay Lousberg, CC0',
    source:
      'KayKit Medieval Builder Pack 1.0 (Kay Lousberg, kaylousberg.com) — Models/objects/gltf/detail_rocks.gltf.glb, simplified scripts/convert-model.ts (ratio 0.45, error 0.05)',
    sha256: '471062b204d6f9d9592260027017d64a3a41ad13a91e8bb9bb03cac19a8910d6',
    status: 'licensed',
  },
  {
    id: 'model-rocks-small',
    file: 'public/models/rocks-small.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Medieval Builder Pack — Kay Lousberg, CC0',
    source:
      'KayKit Medieval Builder Pack 1.0 (Kay Lousberg, kaylousberg.com) — Models/objects/gltf/detail_rocks_small.gltf.glb, simplified scripts/convert-model.ts (ratio 0.5, error 0.05)',
    sha256: 'ce8919daa802dedd1ffc2ea5bdc49c82cb1553fc009e8d0af488d84537faa751',
    status: 'licensed',
  },
  {
    id: 'model-farm-plot',
    file: 'public/models/farm-plot.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Medieval Builder Pack — Kay Lousberg, CC0',
    source:
      'KayKit Medieval Builder Pack 1.0 (Kay Lousberg, kaylousberg.com) — Models/objects/gltf/farm_plot.gltf.glb, simplified scripts/convert-model.ts (ratio 0.5, error 0.05)',
    sha256: '7ecc219c95263762ddd1590f01792ab583eb27e45d4191d2121b9086292a0f7c',
    status: 'licensed',
  },
  {
    id: 'model-fence',
    file: 'public/models/fence.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Spooktober Seasonal Pack — Kay Lousberg, CC0',
    source:
      'KayKit Spooktober Seasonal Pack 1.1 (Kay Lousberg, kaylousberg.com) — Models/gltf/fence.gltf.glb, simplified scripts/convert-model.ts (ratio 0.7, error 0.05); material remapped to the shared wood palette',
    sha256: '97c8192027f4429ad27b74b36dec9d3fa05d0fe7cbf5d4be618c3adf92209eb4',
    status: 'licensed',
  },
  {
    id: 'model-path-cobbled',
    file: 'public/models/path-cobbled.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Spooktober Seasonal Pack — Kay Lousberg, CC0',
    source:
      'KayKit Spooktober Seasonal Pack 1.1 (Kay Lousberg, kaylousberg.com) — Models/gltf/pathCobbled.gltf.glb, simplified scripts/convert-model.ts (ratio 0.35, error 0.05)',
    sha256: '107309f0c7ca7a020fafa88a701ef0298dfa6c8d9360829f700594fe6af95fe0',
    status: 'licensed',
  },
  {
    id: 'model-path-dirt',
    file: 'public/models/path-dirt.glb',
    type: 'model',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'KayKit Spooktober Seasonal Pack — Kay Lousberg, CC0',
    source:
      'KayKit Spooktober Seasonal Pack 1.1 (Kay Lousberg, kaylousberg.com) — Models/gltf/pathDirt.gltf.glb, simplified scripts/convert-model.ts (ratio 0.35, error 0.05)',
    sha256: '57d1e2ec82a68e2eb9dd7d3218fb7604ce3424bf280505a72a7bc3d4f13a50ce',
    status: 'licensed',
  },
];
