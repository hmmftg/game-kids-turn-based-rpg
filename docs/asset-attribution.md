# Asset attribution

Third-party assets shipped by the game. The machine-readable source of truth
is `src/services/assets/registry.ts` (+ `src/services/audio/manifest.ts` for
audio); `npm run validate:assets` gates the build on it. This file is the
human-readable record.

## 3D models (`public/models/`)

| File            | Upstream asset                        | Pack                             | Author                                                    | License                                                       |
| --------------- | ------------------------------------- | -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| `home-gate.glb` | `Models/objects/gltf/house.gltf.glb`  | KayKit Medieval Builder Pack 1.0 | Kay Lousberg ([kaylousberg.com](https://kaylousberg.com)) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `shop.glb`      | `Models/objects/gltf/market.gltf.glb` | KayKit Medieval Builder Pack 1.0 | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `fountain.glb`  | `Models/objects/gltf/well.gltf.glb`   | KayKit Medieval Builder Pack 1.0 | Kay Lousberg                                              | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

CC0 dedicates the works to the public domain — no attribution is legally
required; the author requests a credit, which we provide here and in the
registry. Modifications: filenames renamed, and each model was decimated
with `@gltf-transform/cli` (`simplify --ratio 0.4 --error 0.01`) to fit the
per-tier triangle budgets in `scripts/measure-world.ts`; no other changes.

Only **CC0** or **CC BY 4.0** assets may ship. CC BY requires the license link
plus a modification notice in this table, and the project MIT license never
governs a bundled asset.

## Fonts

- `vazirmatn-{Regular,Bold}-subset.woff2` — Vazirmatn, Saber Rastikerdar,
  [SIL OFL 1.1](https://openfontlicense.org/), subset to Persian glyphs.

## Icons / audio

Placeholder icons are generated locally for this project; audio files are
declared in `AUDIO_MANIFEST` (currently placeholder sine-generated WAVs).
