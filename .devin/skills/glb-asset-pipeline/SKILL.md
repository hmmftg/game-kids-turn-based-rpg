---
name: glb-asset-pipeline
description: Converting downloaded 3D model packs (KayKit CC0, Sketchfab CC-BY) into shipped GLBs for the kids RPG — license gate, convert-model.ts flags, vertex-color bake, component generation, placement, registry, tier budgets.
---

# GLB asset pipeline

End-to-end recipe for turning a downloaded model into a shipped
`public/models/*.glb` + `src/world/models/gltf/<Name>.tsx` wired into
`GLTF_MODELS`. Distilled from the landmark/prop/critter/scenery phases —
every step below exists because something broke without it.

Full reference (flag semantics, per-pack source survey, the demand-render
debugging playbook): **`docs/MODELS.md`**.

## 1. License gate — do this FIRST

- Only **CC0** or **CC BY 4.0** ships. Every KayKit pack carries
  `License.txt` (CC0-1.0); Sketchfab zips carry `license.txt` — verify it
  is CC BY 4.0, not NC/SA. Packs with only a `readme.txt`
  (LowpolyForestPack, `Models.zip`, Voxel House) are NOT cleared.
- `.crdownload` files are truncated Chrome downloads — unusable. `.usdz`
  needs a USD toolchain we do not ship — ask for GLB/glTF instead.
- Every shipped file needs a `model-*` entry in
  `src/services/assets/registry.ts` (`license`, `licenseUrl`, `attribution`,
  `source` with upstream path + conversion params, `sha256`, `status`) plus
  a row in `docs/asset-attribution.md`. CC-BY rows need the real author +
  model URL (see `model-koi`). `npm run validate:assets` fails the build on
  unregistered binaries — that is the enforcement point.

## 2. Convert

```
node --experimental-strip-types scripts/convert-model.ts \
  <in.glb|gltf> <out.glb> [--ratio r] [--error e] [--flat r,g,b] [--vcolor] \
  [--unskin] [--pose <sec>] [--no-anim] [--brighten f]
```

- **`--vcolor` is mandatory for every shipped model.** It bakes each
  primitive's baseColorFactor into `COLOR_0`, drops the file's materials,
  and joins to one primitive per mesh. The tier `geometries` ceiling is the
  binding budget — before the bake, 33 of 61 high-tier geometries were GLB
  primitives; after, 7. Materials collapse to one shared `VERTEX_LAMBERT`.
- **Texture sources**: when the material has `baseColorTexture`, `--vcolor`
  samples it per-vertex at `TEXCOORD_0` (+ `emissiveTexture` when present)
  — this is what keeps painted Sketchfab textures and KayKit palette PNGs
  colored. Pre-check the source `.gltf`: `baseColorTexture` + white
  `baseColorFactor` means texture-driven. `--flat` is only for
  monochrome-OK sources.
- **`--no-anim` for every shipped model** — it also drops morph targets
  (the koi's swim clip was 150 targets, 3 MB → 129 KB). We never play
  animations under demand rendering.
- **Rigged sources**: `--unskin` bakes linear-blend skinning into static
  positions. When the file's authored rest pose is the scattered shard
  layout (its _animation_ assembles it — common in auto-rigged Sketchfab
  models), add `--pose <seconds>` to pose the joints first.
- `--brighten f` multiplies baked colors for dark textures. It lifts; it
  cannot fix an off-theme model.
- `flatten()` inside the pipeline resolves node offsets — measure bounds
  AFTER conversion on the shipped file (the script prints bounds JSON,
  triangles, `doubleSided`, bytes, sha256 — keep all of it).
- Ratios used so far: props ~0.25–0.4, characters ~0.6–0.75, scenery
  ~0.35–0.55, `1.0` keeps everything. Target ≤ ~1k tris/model.
  Re-simplifying an already-baked file preserves `COLOR_0` — second-pass
  shrink is safe.
- KayKit Mini-Game "characters" are 4-mesh assemblies under `Characters/` —
  use those, not the capsule bodies at pack root. Over-simplified animals
  read as blobs; sanity-render first (scripts/model-shot.ts, gltf-shot.ts).

## 2a. doubleSided sources

Sketchfab auto-rigged models often ship `doubleSided` materials. The bake
drops materials → backfaces cull → the model looks fragmented into dark
shards with perfectly valid vertex data. The converter prints
`doubleSided: true`; when it does, generate the component with `--ds`
(VERTEX_LAMBERT_DS). Diagnostic tell: `--vcolor` and `--flat` outputs with
identical indices that render differently = culling, not geometry.

## 2b. Visual gate

A correct conversion can still be rejected for a children's world — the
phoenix assembled and shaded fine but read as a dark murky fantasy bird
(its Sketchfab fire was a bloom shader, not texture). Check: friendly,
recognizable at arm's length? If not, reject it; the cubic slot stays.

## 3. Register + hash

- `sha256` must come from the FINAL `public/models/*.glb` — recompute on
  the shipped file whenever you re-run conversion.

## 4. Generate the component

```
node --experimental-strip-types scripts/gen-gltf-component.ts \
  [--ds] public/models/foo.glb [ComponentName]
```

`--ds` binds `VERTEX_LAMBERT_DS` — required when convert-model.ts reported
`doubleSided: true` (§2a).

Emits `src/world/models/gltf/<Name>.tsx` with the invariants baked in —
do not bypass them by hand-writing components:

- `MODEL_URL` is `import.meta.env.BASE_URL`-relative (subpath deploys;
  `check-deploy` rejects root-absolute refs).
- **No module-scope `useGLTF.preload`** — importing the module must not
  fetch while the cubic ModelSet is active.
- `raycast={noRaycast}` on every mesh — GLB meshes are decorative; taps
  live on explicit proxies/wrappers (e.g. `DoorDetail`, `ReactiveProp`).
- Shared `VERTEX_LAMBERT` — one material instance for all GLBs keeps the
  per-tier materials budget flat.

`npm run gen:model` (gltfjsx) still exists for multi-material sources, but
all shipped models are single-mesh vertex-baked — the generator suffices.

## 5. Place it

- `src/world/models/gltf/placement.ts`: add a measured bounds const + fit
  via `fitLandmark` (landmarks: façade toward the anchor, front face at
  `LANDMARK_MAX_DETAIL_Z`) or `fitToSize` (props/critters/scenery:
  footprint centred, base on y=0). Never guess bounds at runtime.
  Determine facing from vertex spread, not eyeballing — put the needed
  `rotationY` in the fit and check both axes' extremity shapes.
- `src/world/decorations.ts`: REPLACE an existing slot's kind — do not add
  slots (object budget). `isDecorationClear` + `decorationFootprint`
  validate the full footprint against anchors, NPC standpoints, paths,
  props, `HIDDEN_FINDS`, `FACT_DECORATIONS`. The slot must also land inside
  a named area — a position resolving to `null` area never mounts.
- Critter patrols: verify EVERY pair of waypoints is mutually reachable
  (`isDecorationClear`-style corridor checks) — pockets bisected by paths
  silently strand critters. New kinds also need: `CritterKind` union,
  patrol + pool entry in `critters.ts`, speed/idle/`beginMove` case in
  `useCritters.ts`, cubic mesh + `CubicAnimal` dispatch, footprint in the
  patrol test's parametrized table.

## 6. Wire the adapter

- `gltfModels.tsx`: add the dispatch case inside Suspense + error boundary.
  Every GLB slot needs a cubic fallback (`cubicModels.ts`/`cubic.tsx`) —
  the `ModelSet` contract is total.
- `pendingFallback` must be CHEAP (low-detail cubic or `null`) — a
  full-detail fallback caused the transient object-budget spike while
  GLBs resolved.
- GLBs mount only on `high`/`very-high` — `normal` sits at ~99.6% of its
  triangle budget. `detailLevelFor`: normal=4, high=5, very-high=6. Two
  gates, pick per cost (docs/MODELS.md §7): model-fit `minDetail` gates
  only the GLB (koi, farm, fence at 6); `CritterPlacement.minDetail` gates
  the whole critter incl. cubic — needed when even the fallback blows a
  tier's object transient (elephant, 15-object cubic → very-high only).
- `InvalidateOnResolve` after Suspense resolution is required —
  `frameloop="demand"` will not repaint otherwise.

## 7. Verify

- `node --experimental-strip-types scripts/measure-world.ts` — ALL five
  tiers; ceilings live in the script. Measure after EVERY asset/placement
  change, not at the end. `objects` counts EVERY scene node (traverse —
  groups, joints, meshes): a multi-part cubic critter costs ~15 nodes, so
  it can flip the object ceiling even when triangles pass — that is when
  `CritterPlacement.minDetail` applies.
- `e2e/gltf.spec.ts`: update the mesh-name regex (post-bake names are node
  names like `house`, `detail_treeA`) and the per-tier eager-fetch set —
  only models in spawn-visible areas fetch eagerly; distant ones stay
  lazy. Lower tiers must request ZERO `.glb` files.
- In-world visual sanity on `very-high`: drive via the world probes
  (`__worldScene`/`__worldRenderer`/`__worldCritterTransforms`) — but read
  docs/MODELS.md §8 FIRST: demand-rendering makes naive screenshots lie;
  capture `canvas.toDataURL()` synchronously inside the same evaluate as
  your render.
- `npm run verify` fully green — no skipped stages.

## Hygiene gotchas (each one already burned us)

- `eslint .` lints the whole tree — scratch `*-tmp.*` scripts with
  `require`/`any`/`console` fail it. Delete scratch files or write real
  tooling under `scripts/`.
- Windows box: `prettier --write` normalizes to LF; ` M` status entries
  that are EOL-only are stat noise — check `git diff --stat` for real churn.
- `*.tsbuildinfo` is gitignored-but-tracked — revert before committing.
- `npm`/`npx` shims intermittently hit a WSL mount bug on this box —
  call `node node_modules/<pkg>/bin/<cli>.js` or
  `node --experimental-strip-types scripts/<x>.ts` directly.

## Devin secrets needed

- None.
