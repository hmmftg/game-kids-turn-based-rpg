# Models — provenance, pipeline, licensing

Offline-first 3D: every shipped model is a vertex-colored GLB under
`public/models/`, precached by the service worker. No remote URLs, no runtime
textures, no per-file materials — every GLB renders through one shared
`VERTEX_LAMBERT` (or `VERTEX_LAMBERT_DS` for double-sided sources).

The operational recipe lives in `.devin/skills/glb-asset-pipeline/SKILL.md`;
this document is the durable reference: what the flags do, which source packs
exist and their license status, how each model kind integrates, and the
debugging playbook for the demand-rendered canvas.

## 1. License gate — before any conversion

Only **CC0** or **CC BY 4.0** assets may ship.

- KayKit packs carry `License.txt` (CC0-1.0). A pack with only a
  `readme.txt` is NOT cleared (e.g. `LowpolyForestPack`, generic
  `Models.zip`, `Voxel House`) — find the license or do not ship it.
- Sketchfab downloads include `license.txt` in the zip. Verify it says
  CC BY 4.0 (not CC-BY-NC/SA) and record author + model URL for attribution.
- CC-BY entries must carry the real author and source URL in both the
  registry `attribution` string and `docs/asset-attribution.md`. See
  `model-koi` / `model-elephant` in `src/services/assets/registry.ts` for
  the shape.
- `.crdownload` files are truncated Chrome downloads — not usable.
  `.usdz` needs a USD toolchain we do not ship; ask for GLB/glTF instead.
- `npm run validate:assets` fails the build on unregistered binaries — that
  is the enforcement point; every `public/models/*.glb` needs a `model-*`
  registry entry with the shipped file's sha256.

## 2. convert-model.ts flag reference

```
node --experimental-strip-types scripts/convert-model.ts \
  <in.glb|gltf> <out.glb> [flags]
```

| flag           | what it does                                                                                          | when                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `--ratio r`    | meshopt simplification ratio                                                                          | always; target ≤ ~1k tris (props ~0.25–0.4, characters ~0.6–0.75, scenery ~0.35–0.55, `1.0` to keep all) |
| `--error e`    | simplification error bound                                                                            | rarely                                                                                                   |
| `--vcolor`     | bake color into `COLOR_0`, drop all materials, join to one primitive per mesh                         | **mandatory for every shipped model**                                                                    |
| `--flat r,g,b` | strip textures, set one baseColorFactor                                                               | monochrome-OK sources only                                                                               |
| `--unskin`     | bake linear-blend skinning (JOINTS/WEIGHTS + inverse bind matrices) into static positions, drop skins | rigged sources                                                                                           |
| `--pose <sec>` | evaluate all animation channels at a time and write TRS onto nodes before `--unskin`                  | sources whose rest pose is scattered because the animation assembles the model                           |
| `--no-anim`    | dispose animations AND morph targets                                                                  | every shipped model (we never play them — the koi's swim anim was 150 morph targets, 3 MB → 129 KB)      |
| `--brighten f` | multiply baked vertex colors                                                                          | dark textures; helps, cannot fix off-theme models                                                        |

The script prints triangles, bounds (JSON), `doubleSided`, bytes, and
sha256 — capture all of it; the registry entry and the `*_BOUNDS` const come
straight from this output.

### How `--vcolor` handles textures

When a primitive's material carries `baseColorTexture`, the bake samples it
per-vertex at `TEXCOORD_0` (sRGB→linear, multiplied by `baseColorFactor`,
plus `emissiveTexture` where present). That covers both cases:

- **Painted textures** (Sketchfab koi/elephant) — real per-vertex colors.
- **Palette textures** (KayKit Forest Nature / City Builder / RPGTools) —
  every vertex inside a palette cell samples the same color, so the bake is
  exact despite being per-vertex.

Before converting a textured source, open its `.gltf` JSON: if
`baseColorTexture` is present and `baseColorFactor` is `[1,1,1,1]`, the
model is texture-driven — `--vcolor` is required (pre-sampling, it would
have baked white).

`pngjs` + `jpeg-js` (devDeps) decode source textures — jpeg appears in
Sketchfab packs.

## 3. Source-pack survey (this machine)

| pack                                               | license                             | texture style           | shipped                     | still available                                                                                          |
| -------------------------------------------------- | ----------------------------------- | ----------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| KayKit Mini-Game                                   | CC0                                 | flat vertex colors      | duck, dog                   | `character_bear`, `tree_forest`, `plantA/B_forest`, `rocksA/B_forest`, `flag`, `star`, `heart`, `target` |
| KayKit Medieval Builder                            | CC0                                 | flat                    | landmarks                   | `bridge`, `watermill`, `wall_*`, `detail_hill/mountain/forest`                                           |
| KayKit Forest Nature                               | CC0                                 | palette PNG             | bush, rock                  | `Grass_1/2`, `Tree_1–4`, `Tree_Bare`, more Bush/Rock variants                                            |
| KayKit City Builder Bits                           | CC0 (github.com/KayKit-Game-Assets) | palette PNG             | bench, streetlight          | `trash_A/B` (cars/buildings off-theme)                                                                   |
| KayKit Platformer                                  | CC0                                 | flat per-color variants | —                           | `spring(_pad)`, `flag_*`, `sign`, `star`, `heart`                                                        |
| KayKit Spooktober                                  | CC0                                 | flat                    | —                           | `pumpkinLarge/Small`, `lampPost` (rest is graveyard theme)                                               |
| KayKit RPGTools / MixedBag / ResourceBits          | CC0                                 | palette PNG             | —                           | `lantern`, `bucket_metal`, `flax_flower`, `Wood_Log_*`, `umbrella`, `chicken_plushie`                    |
| Sketchfab: Koi Fish (7PLUS)                        | CC-BY-4.0                           | painted jpeg            | koi → fish variant          | —                                                                                                        |
| Sketchfab: Elephant Animation Idle (GremorySaiyan) | CC-BY-4.0                           | painted + normal map    | elephant critter            | —                                                                                                        |
| Sketchfab: Real-time Bones Phoenix (NORBERTO-3D)   | CC-BY-4.0                           | painted, dark           | **rejected at visual gate** | —                                                                                                        |
| Skeletons / FantasyWeapons                         | CC0                                 | —                       | —                           | combat theme — off-limits                                                                                |
| BlockBits / hex tiles                              | CC0                                 | —                       | —                           | voxel/board style mismatch                                                                               |
| LowpolyForestPack, Models.zip, Voxel House         | **no license**                      | —                       | —                           | hard gate — never ship                                                                                   |

No source exists for `fish`(other), `butterfly`, `bird`, `eagle`, `cat`,
`basket`, `planter`, `shell`, `kite`, `grass`, `flower`, `logs` — those
slots stay cubic until a licensed source is found.

## 4. The visual gate

A technically perfect conversion can still be rejected for the world. The
phoenix assembled correctly and rendered — but its painted textures are
genuinely dark (mean linear ≈ 0.25; its fiery Sketchfab look came from a
bloom shader), reading as a murky fantasy bird. `--brighten` lifts colors
but cannot fix an off-theme model. For a children's world the check is:
does it read as a friendly, recognizable thing at arm's length? If not,
reject it — the cubic fallback stays.

Also check the source truthfully: the City Builder `bench` is a real low
flat slab (0.4×0.1×0.15), not a simplification artifact — it still reads as
a bench in-world.

## 5. Integration checklist (per model)

1. License verified (§1).
2. Convert with `--vcolor --no-anim` (+ `--unskin`/`--pose`/`--brighten` as
   needed) → `public/models/<name>.glb`. Record the printed bounds/sha256.
3. `model-shot`/`gltf-shot` visual check — orientation, colors, backfaces
   (see §6 doubleSided).
4. `node --experimental-strip-types scripts/gen-gltf-component.ts [--ds]
public/models/<name>.glb [Name]` → `src/world/models/gltf/<Name>.tsx`.
   Use `--ds` when the converter reported `doubleSided: true`.
5. `placement.ts`: `*_BOUNDS` const from step 2 + `fitToSize` (or
   `fitLandmark`). Determine nose direction from vertex spread, not guesses —
   put the needed `rotationY` in the fit (elephant faces +x → `-π/2`; koi
   faces −x → `π/2`; streetlight arm points −x at yaw 0).
6. Wire the dispatch: `gltfModels.tsx` (GLB) + `cubic.tsx`/`cubicModels.ts`
   (fallback) — the `ModelSet` contract is total on every tier.
7. `decorations.ts` re-kind or `critters.ts` patrol — never add slots;
   verify footprints/patrol pairwise reachability; gate with `minDetail`
   when budget demands (see §7).
8. Registry `model-*` entry (sha256 of the shipped file) +
   `docs/asset-attribution.md` row.
9. `e2e/gltf.spec.ts`: mesh-name regex + per-tier eager-fetch set.
10. `scripts/measure-world.ts` — all five tiers, after EVERY change.

## 6. doubleSided — the silent fragmentation

Sketchfab auto-rigged models routinely ship `doubleSided` materials. The
`--vcolor` bake drops materials, so backfaces cull and the model renders as
scattered dark shards even though vertex data is correct. Tells:

- converter prints `doubleSided: true`;
- `--vcolor` and `--flat` outputs have identical positions/indices yet one
  renders assembled and the other fragmented — that means culling, not
  geometry.

Fix: generate the component with `--ds` → `VERTEX_LAMBERT_DS` (DoubleSide
Lambert in `src/world/models/materials.ts`). The converter's `doubleSided`
field exists precisely so you never have to guess.

## 7. Tier gating with minDetail

GLBs mount only on `high`/`very-high`; `normal` sits at ~99.6% of its
triangle budget. Two gates exist, both checked at `detailLevelFor`
(normal=4, high=5, very-high=6):

- `SCENERY_GLBS`/`ANIMAL_FITS` `minDetail` — the GLB only mounts at/above a
  detail level (farm, fence, koi, elephant: `minDetail: 6` = very-high only).
- `CritterPlacement.minDetail` — the **whole critter** (cubic fallback
  included) only exists at/above the level. Required when even the cubic
  fallback would blow a budget: the elephant's ~15-object cubic form pushed
  `high`'s resolution transient past its object ceiling, so its placement
  is `minDetail: 6` and `high` never sees it at all.

Pick the gate that matches the cost: GLB-only cost → model fit; whole-slot
cost → placement.

## 8. Debugging the demand-rendered canvas (the elephant saga)

`frameloop="demand"` makes naive probing lie. Symptoms we burned a day on: a
mesh whose CPU-side data, `matrixWorld`, bounding box, layers, visibility,
and draw-call submission were all correct — while every probe screenshot
showed it flooding the screen.

**Root cause:** probe-rendered frames race the app's demand-repaint. A DOM
screenshot or `page.screenshot()` captures whichever render landed last —
the app's, not yours. Mutating `__worldCamera` and calling `render()`
produces a frame the app immediately overwrites; WORSE, parked probe cameras
make a healthy mesh _look_ broken.

Reliable capture recipe:

```ts
await page.evaluate(() => {
  const w = window as any;
  w.__worldRenderer.render(w.__worldScene, myCamera);
  return w.__worldRenderer.domElement.toDataURL(); // synchronous!
});
// decode the data URL — do NOT page.screenshot() afterwards
```

Rules learned the hard way:

- `canvas.toDataURL()` must run synchronously in the same `evaluate` as
  `render()` — `preserveDrawingBuffer: false` invalidates the buffer once
  the frame is presented.
- `__worldCamera` may be stale for your purpose (matrixWorldAutoUpdate) —
  build a fresh `THREE.PerspectiveCamera` in-page.
- Isolate before blaming: render the GLB **alone in a bare scene** to split
  mesh-data bugs from scene-state bugs.
- CPU-side correctness + GPU-side flood ≠ "mesh is broken" — check your
  capture path first.
- Interleaved vertex buffers are FINE — don't speculatively `unpartition()`
  a working pipeline; it changes the shipped sha256 for nothing.
- Raycast the frame center / count `renderer.info.render.triangles` to ask
  "did it draw?" without trusting pixels.
- The honest end-to-end check: walk the avatar to the area and let the
  app's own camera render it.

Useful probe hooks (dev/`?probe=1`): `__worldScene`, `__worldRenderer`,
`__worldCamera`, `__worldToScreen`, `__worldCritterTransforms()`,
`__worldAt`, `__worldMapId`, `__worldNpcs`, `__worldDiag`,
`__worldDisposeEvents`, `__worldAnimationEvents/Stats`.

## 9. Rigged sources

We ship static GLBs; rigged sources need baking before they ship:

- `--unskin` resolves joints→weights→IBMs into positions. If the file's rest
  pose ≠ bind pose (auto-rigged Sketchfab models!), parts still assemble
  correctly — the bake is exact, not an approximation.
- If the model's rest pose is literally the scattered shard layout because
  its _animation_ assembles the body, add `--pose <seconds>` to pose joints
  from an animation channel first. Verify by rendering the raw skinned GLB:
  if three.js shows it assembled, the skin+animation holds the real pose.
- Sanity numbers: elephant 5,998 → 1,199 tris at `--ratio 0.2`; ~318 rigid
  sub-shards is normal for auto-rigged sources and not a bug.
- We never ship animations (`--no-anim`). Playback under demand rendering is
  a separate unsolved problem — AnimationMixer wants a persistent loop we
  deliberately do not run.
