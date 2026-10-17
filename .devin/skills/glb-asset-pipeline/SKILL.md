---
name: glb-asset-pipeline
description: Converting downloaded 3D model packs (KayKit CC0 etc.) into shipped GLBs for the kids RPG — license gate, convert-model.ts flags, vertex-color bake, component generation, placement, registry, tier budgets.
---

# GLB asset pipeline

End-to-end recipe for turning a downloaded model into a shipped
`public/models/*.glb` + `src/world/models/gltf/<Name>.tsx` wired into
`GLTF_MODELS`. Distilled from the landmark/prop/critter/scenery phases —
every step below exists because something broke without it.

## 1. License gate — do this FIRST

- Only assets whose pack contains a license file may ship. Every KayKit
  pack carries `License.txt` (CC0-1.0). Packs with only a `readme.txt`
  (e.g. LowpolyForestPack, generic `Models.zip`) are NOT cleared — verify
  the license or do not ship them.
- Every shipped file needs a `model-*` entry in
  `src/services/assets/registry.ts` (`license`, `licenseUrl`, `attribution`,
  `source` with upstream path + conversion params, `sha256`, `status`) plus
  a row in `docs/asset-attribution.md`. `npm run validate:assets` fails the
  build on unregistered binaries — that is the enforcement point.

## 2. Convert

```
node --experimental-strip-types scripts/convert-model.ts \
  <in.glb|gltf> <out.glb> [--ratio r] [--error e] [--flat r,g,b] [--vcolor]
```

- **`--vcolor` is mandatory for every shipped model.** It bakes each
  primitive's baseColorFactor into `COLOR_0`, drops the file's materials,
  and joins to one primitive per mesh. The tier `geometries` ceiling is the
  binding budget — before the bake, 33 of 61 high-tier geometries were GLB
  primitives; after, 7. Materials collapse to one shared `VERTEX_LAMBERT`.
- `flatten()` inside the pipeline resolves node offsets — measure bounds
  AFTER conversion on the shipped file (the script prints them as JSON,
  along with triangles/bytes/sha256).
- Textured packs (Forest Nature, City Builder Bits, RPG Tools) either pass
  `--flat r,g,b` or just `--vcolor` — the bake reads `baseColorFactor`,
  which is already the palette color.
- Ratios used so far: props ~0.25–0.4, characters ~0.6–0.75, scenery
  ~0.35–0.55. Target ≤ ~1k tris/model. Re-simplifying an already-baked
  file preserves `COLOR_0` — second-pass shrink is safe.
- KayKit Mini-Game "characters" are 4-mesh assemblies under `Characters/` —
  use those, not the capsule bodies at pack root. Over-simplified animals
  read as blobs; sanity-render first (scripts/model-shot.ts, gltf-shot.ts).

## 3. Register + hash

- `sha256` must come from the FINAL `public/models/*.glb` — recompute on
  the shipped file whenever you re-run conversion.

## 4. Generate the component

```
node --experimental-strip-types scripts/gen-gltf-component.ts \
  public/models/foo.glb [ComponentName]
```

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
- `src/world/decorations.ts`: REPLACE an existing slot's kind — do not add
  slots (object budget). `isDecorationClear` + `decorationFootprint`
  validate the full footprint against anchors, NPC standpoints, paths,
  props, `HIDDEN_FINDS`, `FACT_DECORATIONS`. The slot must also land inside
  a named area — a position resolving to `null` area never mounts.
- Critter patrols: verify EVERY pair of waypoints is mutually reachable
  (`isDecorationClear`-style corridor checks) — pockets bisected by paths
  silently strand critters.

## 6. Wire the adapter

- `gltfModels.tsx`: add the dispatch case inside Suspense + error boundary.
  Every GLB slot needs a cubic fallback (`cubicModels.ts`/`cubic.tsx`) —
  the `ModelSet` contract is total.
- `pendingFallback` must be CHEAP (low-detail cubic or `null`) — a
  full-detail fallback caused the transient object-budget spike while
  GLBs resolved.
- GLBs mount only on `high`/`very-high` — `normal` sits at ~99.6% of its
  triangle budget. `detailLevelFor`: normal=4, high=5, very-high=6; use
  `detailLevel` for intra-GLB-tier gating (e.g. farm/fence at 6 only).
- `InvalidateOnResolve` after Suspense resolution is required —
  `frameloop="demand"` will not repaint otherwise.

## 7. Verify

- `node --experimental-strip-types scripts/measure-world.ts` — ALL five
  tiers; ceilings live in the script. Measure after EVERY asset/placement
  change, not at the end.
- `e2e/gltf.spec.ts`: update the mesh-name regex (post-bake names are node
  names like `house`, `detail_treeA`) and the per-tier eager-fetch set —
  only models in spawn-visible areas fetch eagerly; distant ones stay
  lazy. Lower tiers must request ZERO `.glb` files.
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
