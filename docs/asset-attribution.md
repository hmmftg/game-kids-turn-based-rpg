# Asset attribution

Third-party assets shipped by the game. The machine-readable source of truth
is `src/services/assets/registry.ts` (+ `src/services/audio/manifest.ts` for
audio); `npm run validate:assets` gates the build on it. This file is the
human-readable record.

## 3D models (`public/models/`)

| File               | Upstream asset                                    | Pack                                | Author                                                    | License                                                       |
| ------------------ | ------------------------------------------------- | ----------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| `home-gate.glb`    | `Models/objects/gltf/house.gltf.glb`              | KayKit Medieval Builder Pack 1.0    | Kay Lousberg ([kaylousberg.com](https://kaylousberg.com)) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `shop.glb`         | `Models/objects/gltf/market.gltf.glb`             | KayKit Medieval Builder Pack 1.0    | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `fountain.glb`     | `Models/objects/gltf/well.gltf.glb`               | KayKit Medieval Builder Pack 1.0    | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `ball.glb`         | `Models/gltf/ball.gltf.glb`                       | KayKit Mini-Game Variety Pack 1.2   | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `duck.glb`         | `Models/Characters/Duck/gltf/character_duck.gltf` | KayKit Mini-Game Variety Pack 1.2   | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `dog.glb`          | `Models/Characters/Dog/gltf/character_dog.gltf`   | KayKit Mini-Game Variety Pack 1.2   | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `crate.glb`        | `Assets/gltf/box_A.gltf`                          | KayKit City Builder Bits 1.0 FREE   | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tree-a.glb`       | `Models/objects/gltf/detail_treeA.gltf.glb`       | KayKit Medieval Builder Pack 1.0    | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tree-b.glb`       | `Models/objects/gltf/detail_treeB.gltf.glb`       | KayKit Medieval Builder Pack 1.0    | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tree-c.glb`       | `Models/objects/gltf/detail_treeC.gltf.glb`       | KayKit Medieval Builder Pack 1.0    | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `rocks.glb`        | `Models/objects/gltf/detail_rocks.gltf.glb`       | KayKit Medieval Builder Pack 1.0    | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `rocks-small.glb`  | `Models/objects/gltf/detail_rocks_small.gltf.glb` | KayKit Medieval Builder Pack 1.0    | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `farm-plot.glb`    | `Models/objects/gltf/farm_plot.gltf.glb`          | KayKit Medieval Builder Pack 1.0    | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `fence.glb`        | `Models/gltf/fence.gltf.glb`                      | KayKit Spooktober Seasonal Pack 1.1 | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `path-cobbled.glb` | `Models/gltf/pathCobbled.gltf.glb`                | KayKit Spooktober Seasonal Pack 1.1 | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `path-dirt.glb`    | `Models/gltf/pathDirt.gltf.glb`                   | KayKit Spooktober Seasonal Pack 1.1 | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `koi.glb`          | `scene.gltf` ([model page](https://sketchfab.com/3d-models/koi-fish-236859b809984f52b70c94fd040b9c59)) | Sketchfab download | 7PLUS ([sketchfab.com/7plus](https://sketchfab.com/7plus)) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `elephant.glb`     | `AnimatedElephant.glb` ([model page](https://sketchfab.com/3d-models/elephant-animation-idle-a8e7e10f005f4baab0a2f5079d759fcd)) | Sketchfab download | GremorySaiyan ([sketchfab.com/gremorysaiyan](https://sketchfab.com/gremorysaiyan)) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

CC0 dedicates the works to the public domain — no attribution is legally
required; the author requests a credit, which we provide here and in the
registry. Modifications: filenames renamed, and each model was decimated to
fit the per-tier triangle budgets in `scripts/measure-world.ts` — the first
three via `@gltf-transform/cli` (`simplify --ratio 0.4 --error 0.01`), the
rest via `scripts/convert-model.ts` (ratio/error per registry `source`). The
`crate` model also had its palette texture stripped in favour of a flat wood
tone; no other changes. The `koi` model had its baseColor texture resampled
into vertex colors and its morph-target swim animation dropped
(`scripts/convert-model.ts --vcolor --no-anim`). The `elephant` model had
its bind pose baked to world space, its baseColor texture resampled into
vertex colors, and its skin + idle animation dropped
(`scripts/convert-model.ts --unskin --vcolor --no-anim --brighten 5`,
ratio 0.2); its source material is double-sided so the shipped mesh
renders with the double-sided shared material.

Only **CC0** or **CC BY 4.0** assets may ship. CC BY requires the license link
plus a modification notice in this table, and the project MIT license never
governs a bundled asset.

## Fonts

- `vazirmatn-{Regular,Bold}-subset.woff2` — Vazirmatn, Saber Rastikerdar,
  [SIL OFL 1.1](https://openfontlicense.org/), subset to Persian glyphs.

## Icons / audio

Placeholder icons are generated locally for this project; audio files are
declared in `AUDIO_MANIFEST` (currently placeholder sine-generated WAVs).
