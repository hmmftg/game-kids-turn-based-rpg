# Plan: Replace cubic critters (cat, eagle, hen, birds) with GLB models

## Goal
Replace the cubic `CatMesh` critter with a GLB cat from the downloaded packs, keeping the cubic model as fallback.

## Approach
- Primary: `an_animated_cat.zip` (animated; better living-world presence).
- Fallback: `bengal_cat.zip` (static; used if animated pack fails to convert or exceeds budget).

## Tasks
1. Extract chosen pack into `public/models/` (e.g. `cat.glb`), run `node --experimental-strip-types scripts/gen-gltf-component.ts public/models/cat.glb Cat`.
2. Register in `src/services/assets/registry.ts` as `model-cat`.
3. Import generated component in `src/world/models/gltfModels.tsx`; add `Cat` to GLB model set with bounds from `placement.ts`.
4. Wire `variant === 'cat'` in `gltfModels.tsx` to use GLB on high tiers, cubic `CatMesh` as Suspense/error fallback.
5. Preserve animation lifecycle: demand-rendered, no permanent loops; idle/walk clips play only while critter is visible.
6. Add `cat` to content validation / model budget checks if applicable.
7. Update e2e selectors only if data-testid changes (none expected).

## Risks
- Animated GLB may be large; check bundle/asset budgets in `npm run verify`.
- Animation clips must not run permanent loops (demand renderer).

## Additional models to integrate
- Eagle: `african_fish-eagle.zip` (or real-time phoenix bird) → `eagle.glb`
- Hen: `hen_3d_model.zip` / `tripo-hens_generated_by_ai.zip` → `hen.glb`
- Birds: `waxwing.zip`, `koi_fish.zip` (aquatic) → `bird.glb` / `koi.glb` (koi already present)

## Tasks (extended)
For each critter (cat, eagle, hen, bird):
1. Extract chosen pack into `public/models/`.
2. Generate component via `scripts/gen-gltf-component.ts`.
3. Register in assets registry.
4. Wire into GLB model set with cubic fallback.
5. Preserve demand-rendered animation lifecycle.
6. Validate with `npm run verify`.
