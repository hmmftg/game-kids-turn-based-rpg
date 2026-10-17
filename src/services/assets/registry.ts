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
    sha256: '6479dc4983d94425c13ecb91077a552d6c631897a523a97b29838724489b586a',
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
    sha256: '8feba40901b03a9d914174641a207f8425f228c6f43f824f9d0fcc8dfb7a4915',
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
    sha256: 'e6739b0129fc35491e528a33e8088d0b53b69b8e50bcc97edfa32ff6d7e0a678',
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
    sha256: 'b5e1441aa20435fe574a1891bf8bb3fd5ac1ad42de291769d98d40072d1c8b00',
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
    sha256: '1b36b5957825c17d4fe9136f7f3d9847cc857654edfd2a2d5a5862b3af861ade',
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
    sha256: '6a6665c9c4049b7a3143a3f2ac39037098383b0528860cd18ed69fa45067c11e',
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
    sha256: '6d8076eb93fa20350f10f0956001068371a6f0a13d52a46b6ad2668c414682b0',
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
    sha256: 'd2e32263f68c494e8c6dbccc08831f23af7087ad6754324b2b68103bbd7c59f9',
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
    sha256: '78fac3aead94b12c8bc4d399b624288646bf1171d4caabb253ef29bf826b5e0a',
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
    sha256: 'b563900d234d3a1a9a09ce1645f7fa188912df02984301ebb30e0a070b01a747',
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
      'KayKit Medieval Builder Pack 1.0 (Kay Lousberg, kaylousberg.com) — Models/objects/gltf/detail_rocks.gltf.glb, simplified scripts/convert-model.ts (ratio 0.45 + 0.5, error 0.05)',
    sha256: '2cbfbe85d67193d32b48b99b184680f27924f4fce05ad19162a204352c337c5a',
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
    sha256: 'a717be34ddeefa7ae6e33f7affa2d13a2694a7b73155ab224fe20a3d00474642',
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
      'KayKit Medieval Builder Pack 1.0 (Kay Lousberg, kaylousberg.com) — Models/objects/gltf/farm_plot.gltf.glb, simplified scripts/convert-model.ts (ratio 0.5 ×2, error 0.05)',
    sha256: '7d4013f5cd677f17fdd5fac51ba09473969a76c58b0bbe53c2a5c0efb60a95b1',
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
    sha256: '9a17149c5886b431ae2306466c5364fd897d8b3aee2c6448209ed47a9d89dc09',
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
    sha256: 'b02e29a4d6d16acbc9ffff88e9f56863f887363c565a479def341d465a31a03a',
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
    sha256: '10380349656c8cd8016b35d5a21a88f4794fbf085d286c24608c9f8a5b9ec934',
    status: 'licensed',
  },
  {
    id: 'model-koi',
    file: 'public/models/koi.glb',
    type: 'model',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution:
      '"Koi Fish" by 7PLUS (sketchfab.com/7plus), CC BY 4.0 — sketchfab.com/3d-models/koi-fish-236859b809984f52b70c94fd040b9c59',
    source:
      'Koi Fish (7PLUS, sketchfab.com) — scene.gltf, converted scripts/convert-model.ts (--vcolor texture bake, --no-anim; ratio 1.0)',
    sha256: 'ddd89f93cd64e34bf635de157a154cff386678c655972a19e36003ce200ea2cf',
    status: 'licensed',
  },
  {
    id: 'model-elephant',
    file: 'public/models/elephant.glb',
    type: 'model',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution:
      '"Elephant Animation Idle" by GremorySaiyan (sketchfab.com/gremorysaiyan), CC BY 4.0 — sketchfab.com/3d-models/elephant-animation-idle-a8e7e10f005f4baab0a2f5079d759fcd',
    source:
      'Elephant Animation Idle (GremorySaiyan, sketchfab.com; mirrored as Sceneview AnimatedElephant.glb) — converted scripts/convert-model.ts (--unskin bind-pose bake, --vcolor texture bake, --no-anim, --brighten 5; ratio 0.2). Source material doubleSided — shipped mesh renders with VERTEX_LAMBERT_DS.',
    sha256: 'defc79de7ae845e47a999391b6e16798326f413b20b1f88f8084b4dd46e6e96f',
    status: 'licensed',
  },
];
