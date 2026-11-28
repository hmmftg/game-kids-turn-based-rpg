# Phase 6.2 Final Stabilization

## Result

**Status: PASS for stabilization and Phase 7 content development.** Garden remains
the sole flagship framework sample; Mahalle remains an independent product.
No new game, future chapter, or framework redesign was introduced. Changes are
committed locally on `codex/phase6-2-final-stabilization`; they were not pushed,
published, or merged.

The Garden release gate is still correctly blocked until authentic independent
asset approvals are supplied. The historical renderer-memory increase was not
reproduced after adding stable-frame measurement; its original root cause remains
unconfirmed and is recorded as a remaining investigation risk below.

## Baseline and merged CI review

- Reviewed baseline and `origin/main`: `ca8b0cca9541ec0f8989596c1c64ca007eedf061`
  (PR #129 merge).
- E2E workflow `46112803228`: passed, including Garden browser acceptance and
  consumer jobs.
- Creator tools workflow `46112803249`: passed.
- Screenshot workflow `46112803243`: passed.
- Roadmap synchronization workflow `46112803255`: synchronization passed; its
  separate `verify` job was skipped.
- GitHub Pages workflow `46112803270`: passed.
- Superseded PR workflow `46112788002`: cancelled; not a post-merge failure.
- Historical renderer-memory failure `45681694732`, job `139443607735`, remains
  a confirmed failed acceptance run: geometry count changed from 6 to 10 while
  texture count stayed at 1 after five map round trips.

## Findings and resolution

| Finding                                                                            | Classification                          | Resolution                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production Playwright discovery included `.dev.spec.ts` files                      | Test synchronization defect             | Production config now ignores development-only specs. Discovery is 23 tests in 8 files for production and 6 tests in 1 file for development.                                                  |
| Vite development server returned 403 for the hoisted Persian font                  | Development integration regression      | Added the installed Vazirmatn package to the narrow Vite filesystem allow list; development browser test now loads the font.                                                                  |
| Strict Mode development checks proved successful requests but not actual drawing   | Evidence gap                            | Opt-in model probes now verify asset identity, geometry, rendered draw calls, skeletal bones and semantic state. Tests also prove the procedural fallback draws after integrity failure.      |
| Reduced-motion ending cue disappeared when the cinematic timeline completed        | Presentation regression                 | The visible Persian cue remains after reduced-motion completion and has accessible narration semantics. Skip, cancellation and camera restoration remain covered.                             |
| Runtime and release validation duplicated asset-policy rules                       | Package/integration regression risk     | Both paths use the exported pure `waypoint-rpg-three` policy resolver, including numeric safety caps, production approval policy and per-asset/scene triangle consistency.                    |
| Model binding resolution could depend on configuration order and declared counts   | Application configuration defect        | Garden validates unique player and target-kind bindings, known assets/maps, real placement ownership and per-map counts against authored scene targets.                                       |
| Immediate cinematic skip could leave terminal narration presentation behind        | Application regression                  | `CinematicStage` performs idempotent terminal cleanup for the execution ID; skip, cancellation and camera restoration are covered.                                                            |
| Historical scene-memory sample could occur before resources settled                | Unverified suspected timing defect      | Scene and model probes now wait for stable frames before baseline and final sampling. Three focused Chromium repetitions did not reproduce growth; no underlying resource leak was confirmed. |
| Mahalle's full workspace typecheck rejected an explicitly undefined opt-in R3F ref | Confirmed cross-project type regression | The disabled model probe now passes `null`, which preserves opt-in behavior and satisfies the stricter `exactOptionalPropertyTypes` consumer build.                                           |
| Release approvals are absent for two Garden assets                                 | Expected release-policy rejection       | The release gate continues to reject both assets. No approval records were fabricated or weakened.                                                                                            |

## Renderer-memory evidence

The historical 6-to-10 geometry failure did not recur in three focused Chromium
memory runs. Each measured the settled scene at 6 geometries / 1 texture before
and after five map transitions. The five transitions recorded 10 scene
disposals. The current independent scene smoke also measured model resources at
3 geometries / 5 textures before and after five canvas reloads, with no browser
page errors. Phase 5 preview capture recorded five map round trips, 10
disposals, and scene memory at 6 / 1 before and after.

Stable-frame waits make the measured scene states comparable and remain bounded.
The previous failure is not represented as a proven leak fix: its original
cause was not reproduced and remains unconfirmed.

## Verification

All commands below were run on the implementation branch. Commands requiring
Node/Vite/Playwright child processes were run with the process access needed by
those tools after the default sandbox returned `spawn EPERM`.

| Command                               | Outcome                                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run framework:check`             | Passed; core, narrative and gameplay boundaries verified.                                                                                                                     |
| `npm run framework:build`             | Passed for core, narrative, gameplay and Three.                                                                                                                               |
| `npm run framework:test`              | Passed: core 15, narrative 40, gameplay 35, Three 61.                                                                                                                         |
| `npm run sample:garden:asset-check`   | Passed with shared runtime policy and actual placement checks.                                                                                                                |
| `npm run sample:garden:asset-test`    | Passed: 6 tests.                                                                                                                                                              |
| `npm run sample:garden:security:test` | Passed: 9 tests.                                                                                                                                                              |
| `npm run sample:garden:test`          | Passed: 38 tests.                                                                                                                                                             |
| `npm run sample:garden:e2e:dev`       | Passed: 6 tests against Vite, including static and rigged mesh draws, integrity fallback, narration, cancellation and reduced motion.                                         |
| `npm run sample:garden:e2e`           | Passed: 23 production browser tests.                                                                                                                                          |
| `npm run framework:scene-consumer`    | Passed. Three focused renderer-memory repetitions and Phase 5 preview acceptance also passed.                                                                                 |
| `npm run framework:garden-consumer`   | Passed from an isolated source copy with offline framework tarballs, type/declaration checks, production build and Chromium smoke.                                            |
| `npm run framework:mahalle-consumer`  | Passed after the ref correction, including workspace typecheck, unit and migration tests, production build and Chromium quest smoke.                                          |
| `npm run framework:generated-games`   | Passed narrative-only and tactical-only packed consumers, including type, build, unit, asset and Chromium gates.                                                              |
| `npm run framework:watch:check`       | Passed linked cold/warm build, Vite resolution, package updates, error preservation and recovery.                                                                             |
| `npm run creator:test`                | Passed: 32 tests.                                                                                                                                                             |
| `npm run creator:import-consumer`     | Passed isolated offline installed-tarball importer consumer.                                                                                                                  |
| `npm run creator:preview:test`        | Passed: 4 browser tests. Generated preview artifact was restored after the check.                                                                                             |
| `npm run models:import:test`          | Passed: 20 tests.                                                                                                                                                             |
| `npm run models:meshy:test`           | Passed: 2 tests with all five local private source models available.                                                                                                          |
| `npm run roadmap:check`               | Passed.                                                                                                                                                                       |
| `npm run verify`                      | Passed the full repository gate, including 588 root tests, typecheck, migration, content and asset validation, budgets, Garden build, Hello World build and scene-demo build. |
| `npm run sample:garden:release:check` | Expected rejection: independent approvals are missing for `phase5-animated-guardian` and `phase5-textured-static`.                                                            |

Playwright discovery was verified explicitly: production selects **23 tests in
8 files**, while development selects **6 tests in 1 file**. The root full
verification reported 9 lint warnings and no lint errors. Existing draft
content, placeholder app icons, large-bundle, optional glTF extension, Three
clock deprecation, and Playwright service-worker warnings remain warnings; no
acceptance gate was relaxed to suppress them.

## Private Meshy source preservation

All five source GLBs remain byte-for-byte unchanged. Final SHA-256 values match
the original local source hashes:

| Source model                                            | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `Meshy_AI_Ancient_Stone_Fountain_20261125_generate.glb` | `5C3962F3776BAC60D3DCBCFE6B8512F289365297A62FCF288A56DB1DF404F68B` |
| `Meshy_AI_Golden_Golem_Sentinel_20261125_generate.glb`  | `CDE253C4BC8BC002692A91ED68A232AB2E8A13CEF15457FED9A96D2D87455111` |
| `Meshy_AI_Pink_Polygon_Tree_20261125_generate.glb`      | `2046FDD2BD391DAF1B1E9548CF4C92B92A977726581AB5755B0384ACD54C6BD8` |
| `Meshy_AI_Roseglass_Shrine_20261125_generate.glb`       | `0CF29CD415ADA97AA3EBE082D5B8D09D0AF0679A7012060E4A9403FBF2FAEC6E` |
| `Meshy_AI_T_Pose_Sage_20261125_generate.glb`            | `39080EF18F6A1F5461608D5E1767BA82B6076EDBCD71C362AC630CEAB6111D27` |

The private models, manifests and screenshots are not part of production
artifacts. No mesh, texture, rig or pose processing was introduced.

## Milestone record

- **A — Baseline and merged CI:** complete.
- **B — Development/production test separation:** complete.
- **C — Shared runtime/release policy validation:** complete.
- **D — Model binding validation against authored maps:** complete.
- **E — Browser rendering and cinematic evidence:** complete.
- **F — Renderer-memory acceptance:** repeated evidence passes; historical root cause remains unconfirmed.
- **G — Gameplay, save, product and asset preservation:** complete; Garden and Mahalle consumers passed.
- **H — Verification and evidence:** complete; release gate correctly remains closed pending approvals.

## Remaining limitations and next step

- Do not treat the original renderer-memory count increase as a confirmed leak
  or as a fully explained incident; investigate further if it recurs.
- Garden release approval remains outstanding for the two assets named above.
- Existing lint/content/asset/bundle warnings remain visible and were not
  weakened by this work.

Garden is ready for Phase 7 game-content development. Phase 7 should add content
to the existing chapter/map structure without expanding scope into another
framework-hardening or sample-game phase. Release remains subject to genuine
asset approvals and the existing acceptance gates.

## Local implementation commits

The verified code milestones after baseline
`ca8b0cca9541ec0f8989596c1c64ca007eedf061` are:

- `53510df131d956236be59cc24b02b6c497b39589` — development model-render evidence.
- `0e6d83ac5514b21a0eb5e5ad14c7d8f462333d26` — reduced-motion narration cue.
- `5ef772b4749c01a947bbfec3e2577b051f9dc6a8` — public runtime policy validation.
- `dc3ba26a96904ed88c17b17a0c3007c0fed9d09a` — development Persian font access.
- `f764879addc94efad1b22c272b03264c1342b05f` — shared runtime/release policy.
- `5e50de16e4595d05bc4b23020c3aad9c87ebbbda` — authored model binding validation.
- `1ccf78b4815eb69a00179d247c2a28d537f4754a` — immediate cinematic skip cleanup.
- `5559c81fce3dc8059b9eddef79d49c971289bad5` — stable renderer-memory samples.
- `60f410d27774b4c2eef06b0d171770221aae66dc` — model count and strict ref hardening.

The final documentation commit and resulting branch SHA are reported in the task
completion message; the report intentionally does not self-reference its own
commit hash.
