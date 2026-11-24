# Reusable RPG Core Framework Roadmap

## Executive summary

Extract one dependency-free TypeScript ESM package through npm workspaces, while keeping the Kids RPG and its renderer at the repository root. Phase 1 delivers a reusable core library, not a completed Three.js RPG engine. The game adopts the package only after an independently installed archive passes a consumer gate. Begin validating a separate 3D game consumer in Phase 2.

Retain React, Three.js, React Three Fiber, Drei, Vite, and the existing app architecture. Preserve child-facing semantics, Persian/RTL, saves, offline/PWA, content and asset rules, and the current renderer.

## Current architecture assessment

The initial review used 0cfcc45a95cde799afae7f801fadd9969dc2301f. Implementation is based on 577fc2630ab871f3c05b190336f5cef5b9103e8a, which includes the GLB/asset-registry work. Before extraction, `examples/hello-world` was a DOM-only consumer of the source barrel. PR 3 passed the independent installed-tarball gate; PR 4 now points both the game and hello-world at the package root. Keep `docs/framework-extraction.md` as historical evidence for the original in-repository boundary.

| Candidate        | Verified capability                                                                                                                                                                                                                              | Phase 1 ownership and gap                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime          | `packages/core/src/runtime.ts` provides an injected reducer and clock, subscriptions, pause/resume and disposal                                                                                                                                  | Preserve existing behavior mechanically. Add no new store or persistence scheduling.                                                                                |
| World/navigation | Identifiers, bounds, graph lookup, A* and structural DTOs are independent of React and Three.js                                                                                                                                                  | The seven pure modules now live in `packages/core/`; the confirmed graph adjacency-cache isolation defect is fixed and regression-tested.                           |
| Persistence      | `packages/core/src/persistence.ts` defines generic scoped load/save results                                                                                                                                                                      | Package only the contract. Profile selection, migration, boot, repositories, autosave and IndexedDB stay in the game.                                               |
| Renderer         | WorldCanvas selects Hub, CaveWorld and ChallengeWorld directly. CameraRig and modelProvider use Kids RPG camera, avatar, visual variants, quality and fallback policy                                                                            | Keep current renderer and scenes in the game. Validate renderer contracts with a separate 3D game consumer in Phase 2.                                              |
| Battle/narrative | The Kids RPG's battle, quests, dialogue and validation remain application-specific. The optional `packages/narrative/` package now provides generic typed dialogue, conditions, effects, quests and state transitions for independent consumers. | Keep the Kids RPG's authored rules and saves unchanged. Do not make narrative a dependency of the core package; consumers opt in to the separate narrative package. |
| World Builder    | Versioned JSON documents are checked and compiled to a preview WorldSource using game-owned NPC data                                                                                                                                             | Keep Builder v1, editor and preview integration in the game. Extract portable authoring later.                                                                      |
| Assets           | Licensed GLBs, static conversion, provenance, quality gating, cubic fallback and cleanup are implemented for the app                                                                                                                             | Keep manifest, artistic policy and offline release decisions with each game. A rig-preserving path belongs to the later renderer phase.                             |

Source evidence includes src/framework/index.ts, docs/framework-api.md, docs/performance-final-report.md, src/world/WorldCanvas.tsx, src/worldbuilder/runtimeAdapter.ts and docs/MODELS.md.

## Phase 1 implementation status

The core workspace package, independent tarball consumer gate, Kids RPG cutover,
application import boundary, and linked Vite development workflow are in place.
The linked workflow passed cold/warm start, browser reload, failed-compile
output preservation, and recovery checks on Windows; the same focused check is
in the existing Linux Playwright job. PR 6 now checks the built deployment tree,
service-worker precache, hidden source maps, and a same-origin old/candidate/old
save round trip. The Windows release/rollback check passed with a real baseline
build, offline candidate resume, schema 3/IndexedDB v2 save, rollback to the
baseline build, and no celebration replay. PR #110 merged the six extraction
steps into main. The post-merge package-consumer and Pages checks passed; all
four Playwright shards passed after shard 2 was rerun. Commit 20be589 added a
follow-up deployment-artifact guard. Phase 1 is complete; Phase 2 validates a
second 3D consumer without extracting a renderer yet.

## Phase 2 consumer validation

`examples/scene-demo/` was introduced in Phase 2 as an independent Three.js
consumer of `waypoint-rpg-core`. Phase 3 added the optional narrative package
and the original story described below. Its scene registry, loader, host
lifecycle, camera setup, R3F components, authored story, save coordinator, and
runtime-fact projection are example-owned. It imports only the public roots of
the core and narrative packages and contains no Kids RPG source imports. This
validates two package consumers in one 3D application; it does not add a
renderer API or claim a completed Three.js RPG engine.

The example registers courtyard and workshop scenes with navigable transition
anchors. Its host keeps the current scene mounted while a destination loads,
preserves the current scene on load failure, cancels and disposes superseded
loads, and disposes active resources at teardown. A single demand-rendered
canvas remains mounted across map transitions. The scenes demonstrate
perspective and orthographic cameras and project a runtime lantern fact
into the workshop. Browser smoke coverage also checks settled idle frames,
subscriptions, scene disposal, and recovery after simulated WebGL context loss.

`npm run example:scene-build` builds the core and narrative packages first,
then builds this example with the default Vite resolver and no `optimizeDeps`
or resolver overrides.
`npm run verify` builds the core once before the repository checks and invokes
the example build with npm lifecycle hooks disabled to avoid recompiling it.
`npm run framework:scene-consumer` performs the package-side boundary/build
checks, copies the example outside the repository, installs its locked
development tools, installs both built package tarballs from disk in offline
mode, then runs typecheck, unit tests, the Vite build, and Chromium browser
smoke. The existing e2e workflow contains a focused step for this consumer
rather than a duplicate application CI workflow.

Phase 2 compatibility evidence is intentionally split:

- Package installation: the local core and narrative tarballs install offline
  after the consumer's development tools have been installed. Both packages
  have zero runtime dependencies; the core's empty-cache native Node install
  remains covered by the Phase 1 package gate.
- Development tools: the scene consumer installs exact locked React,
  React Three Fiber, Three.js, Vite, TypeScript, Vitest, and Playwright versions
  with `npm ci`. This is a separate network/cache operation from package
  archive installation.
- Node runtime: the core and narrative manifests declare Node >=22.0.0. Phase 3
  package and consumer checks ran locally on Node 22.23.5; the existing
  core-only CI minimum-runtime job uses Node 22.0.0, and the combined consumer
  CI job uses Node 22.22.2. The narrative package's 22.0.0 minimum is declared
  but was not separately exercised in this phase. The root project, example
  build, and development tools require Node >=22.22.2 <23 and npm >=10 <11;
  CI pins Node 22.22.2 for root/build tooling. Build-time requirements are not
  implied by the package runtime floor.
- Browser: the scene lifecycle smoke uses Chromium with WebGL, including the
  tested SwiftShader path in headless CI. This is evidence for the tested
  Chromium environment only; other browsers and physical hardware require
  separate validation.

The next renderer decision follows the independent consumer evidence. Keep
scene registration, map transitions, camera policy, resource loading, R3F
components, and game-specific world projection private to the example until a
second real game consumer establishes which contracts should be reusable.

### Current verification and open design decisions

Local Phase 2 verification passed on Node 22.23.5/npm 10.9.9: `npm run verify`
passed all 15 core tests and 474 application tests, then built the app,
hello-world, and scene consumer. The earlier core-only scene-consumer gate
passed its offline tarball installation, 9 unit tests, Vite build, and
Chromium WebGL lifecycle smoke. Phase 3 adds a combined core+narrative tarball
gate and a Persian branching story; its current final verification is recorded
in the Phase 3 section below. The demo is a validation consumer, not evidence
from a second shipped game or other browser/device.

Keep these decisions open until another real consumer needs the same
capabilities: whether scene registration/loading should become a package API;
whether camera contracts should be shared; and which renderer/resource
ownership boundary is common enough to extract. Do not extract narrative,
combat, authored content, or asset policy from this demo alone.

## Phase 3 implementation status — narrative and quests

Phase 3 delivers the optional `waypoint-rpg-narrative` ESM package and extends
only the independent scene-demo. The package exports validated and deeply
copied/immutable narrative definitions, deterministic condition evaluation,
atomic typed effects, quest lifecycle queries, dialogue views, save-state
decoding, and revision/playthrough-checked transitions from one package root.
It has no runtime dependencies and imports no React, Three.js, browser, storage,
core, or application modules. Its consumer boundary is verified from an
independently installed tarball with NodeNext and Bundler declaration checks
and rejected deep imports.

The demo's original Persian story, برگ خون — The Blood Leaf, demonstrates two
branches, quest outcomes, distinct endings, a condition-checked workshop
interaction, and a persistent lantern consequence. The application owns its
versioned save envelope, bootstrap/hydration, localStorage adapter, scene and
playthrough eligibility, save/reset recovery, and modal presentation. `SceneHost`
remains example-owned and can restore a validated map entry anchor. The Kids
RPG does not import the narrative package and its dialogue, quest, save, offline
and safety contracts remain unchanged.

This phase does not complete a general-purpose Three.js RPG engine. Scene
loading, rendering, camera policy, movement, combat, UI and authored narrative
remain game-owned. The current evidence is one independent 3D validation app,
not another shipped game or broad browser/device coverage. See
`docs/framework-api.md` and `examples/scene-demo/README.md` for the implemented
API and consumer boundaries; the detailed acceptance record is in
`.plans/phase-3-narrative-quest-engine.md`.

Local verification on 2026-11-21 used Node 22.23.5/npm 10.9.9. `npm run
verify` exited successfully: 15 core tests, 25 narrative tests, and 493 Kids
RPG tests across 47 files passed, followed by the app, hello-world, and
scene-demo production builds. The core tarball, narrative tarball, combined
scene-demo tarballs, and linked Vite source-update/error-recovery checks all
passed. Chromium story/accessibility and scene-lifecycle smoke passed. Existing
lint/content/asset placeholder and large-chunk warnings remain; no errors were
reported. The baseline `main` E2E (all four shards and framework consumer) and
Pages workflows were green when checked. This unpushed feature branch has not
run its own GitHub Actions workflow; other browsers and physical devices remain
unverified.

## Phase 4 implementation status — gameplay modules

PR #116 merged the optional `waypoint-rpg-gameplay` package at
`693aae689065d108e84b85a16c5651d625c29ab2`. The package provides validated
gameplay definitions, progression and experience, inventory and equipment,
derived attributes, abilities, status effects, tactical grid combat,
deterministic enemy turns, bounded idempotent rewards, terminal outcome
markers, and snapshot encoding/decoding. It imports neither core nor narrative;
the narrative package remains consumable without gameplay. The package
boundary/build checks pass and its prepared Node test suite passes 29/29.

Garden of Stories is the independent integration consumer: it composes the
three package roots, plays both a non-combat gardening path and a real 5×5
guardian encounter, commits combat consequences transactionally into its
authored story, and restores gameplay and world consequences from a versioned
save. Its isolated tarball gate installs each package archive alone and checks
native ESM, NodeNext and Bundler declarations; it then builds and runs the
sample in Chromium. That gate passed locally on Node 22.23.5. The gameplay
package declares Node >=22.0.0; the existing runtime-only CI job now packs the
gameplay archive and includes its ESM/snapshot probe when it switches to Node
22.0.0. This branch's updated GitHub Actions run has not yet supplied remote
CI evidence. Other browsers and physical devices remain unverified.

## Selected architecture

Use one workspace package at packages/core/ while keeping the game at the repository root. Name it waypoint-rpg-core. This is a private, unscoped identity and assumes no registry ownership. Package output is ESM, TypeScript declarations and JS source maps with embedded sources. Export only the package root. Runtime and peer dependencies are empty. Public registry publication is deferred.

Use the repository's pinned TypeScript 6 compiler with a package-local NodeNext/ES2022 configuration, strict checking, types set to [], declarations, source maps, and inline sources. Compile only package code. Use explicit .js relative imports. A TypeScript 6.0.3 emission probe found that rewriteRelativeImportExtensions emits .js in JavaScript but leaves .ts in declaration imports. Explicit .js specifiers work in both outputs, without another bundler.

Keep the current DTO fields and optionality for Edge.requiresDiscoveryId, MapTransition.discoveryId, and WorldMap.cameraZoom/cameraPadding. The game interprets these as discovery, transition and camera policy. They introduce no application imports in the core. Preserve GameRuntime's current clock, notification, pause/resume and disposal behavior. Do not add the post-disposal subscription guard during packaging.

Package API:

| Group                     | Exact exports                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Values                    | createGameRuntime, insideBounds, anchorForLandmark, anchorForNpc, distanceBetween, getAnchor, getAnchorOrNull, neighboursOf, findPath, nearestWalkableAnchor, pathToPoints |
| Identifiers/world/graph   | AnchorId, AreaId, DiscoveryId, LandmarkId, MapId, NpcId, TransitionId, Anchor, Bounds, Edge, MapTransition, NpcPlacement, WorldArea, WorldMap, GraphSource, PathPoint      |
| Runtime/persistence types | GameRuntime, GameRuntimeAdapter, GameRuntimeConfig, ReducerContext, RuntimeListener, LoadResult, PersistenceAdapter, PersistenceFailure, SaveScope, StorageFallback        |

Keep capabilities, quality policy, camera math, perfProbe and the current battle module in game-owned paths for Phase 1. Do not expose internal subpaths or app save types.

### Repository strategy

| Strategy                               | Tradeoff                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm workspaces, game stays at root     | Recommended. Preserves Git history, Pages deployment and app scripts while enabling independent package build and tarball verification.                          |
| Separate repository                    | Revisit after ownership or release cadence separates. Adds cross-repo coordination, release/version flow and offline distribution before there is a second team. |
| Package current src/framework directly | Avoid. The internal barrel combines candidate core with browser probes and app policy, requiring a second package selection.                                     |

The tarball gate proves independence. Workspace links support local iteration after the gate. Do not move the application under games/ in this phase.

Dependency direction:

    Kids RPG
      ├── game-local facade ─── waypoint-rpg-core
      ├── game-local battle module ─── core identifiers
      └── React / React DOM / R3F / Three.js / Drei / PWA

    standalone TypeScript consumer ─── installed core tarball

    independent 3D story consumer ─── installed core + optional narrative tarballs

    future 3D game ─── selected core and optional renderer/gameplay modules

### Roadmap and gates

| Phase                         | Status      | Deliverable                                                                                                                                                                                                                   | Prerequisite and exit evidence                                                                                                                                                                                    | Evidence                                                                                                                                                                                                |
| ----------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reusable core              | Complete    | Build, test, version, pack and document the independent package. Migrate the app only after installed-tarball gate.                                                                                                           | All criteria in .plans/phase-1-library-extraction.md pass.                                                                                                                                                        | [PR #110](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/110)                                                                                                                                  |
| 2. World/renderer             | Complete    | Validate scene registration, map transitions, cameras, loading, runtime projection and resource lifecycle in `examples/scene-demo/`, a second 3D consumer that installs the core tarball. Renderer contracts remain deferred. | Pass isolated tarball install, type/unit/build checks and Chromium lifecycle smoke; prove two scenes, same-canvas transitions, load cancellation/failure, settled demand rendering, context recovery and cleanup. | [PR #111](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/111)                                                                                                                                  |
| 3. Narrative/quests           | Complete    | Implement the optional `waypoint-rpg-narrative` package and a Persian branching-story proof in the independent 3D consumer. Keep storage, scenes, movement, UI, and authored content consumer-owned.                          | P3.1–P3.6 gates pass: pure deterministic runtime, independent tarball, two endings, persisted scene consequence, reset/recovery safety, and application compatibility. This is not combat or a general renderer.  | [PR #113](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/113)                                                                                                                                  |
| 4. Gameplay modules           | Complete    | Add optional progression, inventory, equipment, abilities, status effects, tactical combat and enemy behavior from consumer needs. Keep real-time action combat independent.                                                  | Module tests pass; narrative remains independently consumable without a gameplay dependency.                                                                                                                      | [PR #116](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/116); [29 gameplay tests](../packages/gameplay/test/)                                                                                 |
| 5. Animation/cinematics       | In progress | The independent 3D consumer imports static and genuinely rigged GLBs, projects accepted gameplay into per-instance animation, and stages an optional cancelable timeline. Renderer integration remains example-owned.         | P5.2–P5.4 local unit, production Chromium, lifecycle, accessibility, capture, and regression gates must pass; then candidate CI must confirm package consumers and existing-game compatibility before completion. | [PR #118 model work](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/118); [Phase 5 execution evidence](../.plans/phase-5-model-animation-cinematics.md); [rendered previews](previews/phase5/) |
| 6. Developer tools            | Planned     | Add portable world, dialogue, quest, NPC, asset and timeline authoring after two consumers use relevant contracts.                                                                                                            | Both games can round-trip, validate and preview their own content. Keep Builder v1 compatible through transition.                                                                                                 | —                                                                                                                                                                                                       |
| 7. Shahnameh proof of concept | Planned     | Build خون سیاوش — فصل نخست: برگ خون with two environments, NPCs, branching dialogue, one meaningful moral choice, one battle, conditional world change, two outcomes and save/resume.                                         | Begin after the second 3D consumer validates rendering, narrative persistence and selected combat. Record packages used and omitted. Full editor tooling is optional.                                             | —                                                                                                                                                                                                       |

This table is the source of truth for the generated README roadmap. Change a phase's status only when its exit criteria are met; after editing, run `npm run roadmap:sync`. Merging alone does not complete a phase.

The five-game portfolio, asset catalog, capability matrix, execution dependencies, and release/evaluation rules live in `docs/PRODUCT-RELEASE-ROADMAP.md`. The current two-scene Garden sample and the Phase 4 scene-demo remain reference consumers, not portfolio releases. Proposed game names and stories remain proposals until approved.

### Phase 5 baseline and stabilization evidence

The stabilization baseline was fetched `origin/main` at `1ae9946bd280caa6847e78d6a9b32180a3499ad8` (PR #119). Archived Actions run `45178399523` showed shards 1 and 3 failing the high-tier GLB exact-count assertion: the app correctly requested its 18-model high-tier warmup set while the test expected 7. Shards 2 and 4 passed. The same review identified a Node 22.0 gameplay-runtime smoke invocation that passed a snapshot where the codec requires a compiled definition, a stale Blood Leaf preview selector, and a roadmap workflow attempting to create a PR without permission. The local fixes are recorded in the Phase 5 execution plan; no post-fix GitHub run has been triggered because this branch was not pushed.

The archived reference-screenshot workflow run [45018058155](https://github.com/hmmftg/game-kids-turn-based-rpg/actions/runs/45018058155) failed before browser setup at repository formatting. This was a pre-existing baseline issue, addressed by the earlier scoped formatting hygiene commits; it is separate from the PR #119 model-count regression. Roadmap synchronization remains protected-branch compatible: the default workflow emits a patch artifact and summary, with automatic PR creation only when repository owners explicitly enable `FRAMEWORK_ROADMAP_AUTOPR=true`. That live permission path is not verified from this local-only branch.

Local acceptance on Node 22.23.5 passes `npm run verify` (572 application tests across 60 files, 15 core, 34 narrative, 29 gameplay, 9 model-import tests, all builds and package checks), all three installed package consumers, scene-demo and Garden tarball consumers, the linked Vite development check, and production Chromium browser suites. The independent scene consumer uses pinned local GLB fixtures and produces source-rendered Chromium previews. Exact commands and limitations are recorded in `.plans/phase-5-model-animation-cinematics.md`. These results establish local gates; remote CI remains pending a later candidate PR run.

### Phase 5 re-audit from merged current main — P5.2–P5.4

The re-audit starts from PR #121 merge `7e658199eefa308c73bb0b9662b09e1dfc467867` in isolated worktree `codex/phase5-completion-finalize`. It found that the earlier implementation evidence did not prove all animation-isolation, presentation-lease, and production-capture acceptance details. The new local record keeps Three.js and timeline code private to `examples/scene-demo`; no framework package API or Kids RPG save/gameplay contract changed.

P5.2 now verifies separate skeletons and mixers, isolated animation clocks, stale-command no-op behavior, aborted/late-load disposal, one-instance release, active-animation context recovery, and five remount/map-transition cycles. In the latest Chromium/SwiftShader measurements, the model renderer settled at 4 geometries/5 textures, the map renderer remained 6 geometries/1 texture before and after five warm map round trips, and scene/model idle frame deltas were both zero. P5.3 uses a validated JSON-compatible cue registry and a private deterministic runner for camera, animation, Persian DOM dialogue, local audio, effects, and explicit waits. Skip/cancel/replay and reduced motion preserve the committed narrative snapshot; active audio, effect, camera, animation, input, and focus leases are released or restored.

P5.4's production Chromium capture contains nine distinct rendered states, checks asset and scene readiness, verifies no external requests or browser errors, and records asset bytes, triangles, decoded-texture estimate, joints, clip inventory, measured load duration, renderer counters, the measured accepted move animation, five map round trips, PNG dimensions, and SHA-256 hashes. The manifest is `docs/previews/phase5/provenance.json`; its source commit is `cbb9a59ebd2131a63c88e7530de5a0e800fbb191`. The browser is Chromium 153.0.8010.12 with headless SwiftShader at 1365×1000 and 390×844. No physical mobile GPU or other browser is claimed.

Local final verification passed `npm run verify`, all core/narrative/gameplay/scene/Garden installed-tarball consumer checks, `npm run framework:watch:check`, 77 scene-demo unit tests, and the production Chromium lifecycle/cinematic smoke. Both standalone Phase 5 and combined Blood Leaf + Phase 5 screenshot commands passed. The canonical roadmap remains **In progress** until candidate CI verifies the Node 22.0.0 floor, package consumers, and existing-game compatibility. The screenshot workflow uploads artifacts and emits a review patch by default; automated documentation PR creation is an explicit `FRAMEWORK_ROADMAP_AUTOPR=true` opt-in and also requires the repository's GitHub Actions PR-creation setting.

## Compatibility, policy and risks

Phase 1 preserves child UX, nonviolent rules, content validation, parental gates, accessibility, touch targets, Persian/RTL, existing saves, offline/PWA, assets, GLB/cubic fallbacks, quality tiers, cleanup and WebGL handling. These app rules do not become framework defaults.

Distinguish these compatibility claims:

- Core runtime: Node >=22.0.0, tested by executing emitted native ESM on Node 22.0.0.
- Narrative and gameplay runtimes: both manifests declare Node >=22.0.0 and
  their pure TypeScript ESM runtimes use no Node-specific APIs. Local installed-
  archive ESM checks ran on Node 22.23.5. The existing runtime-only CI job now
  prepares core, narrative, and gameplay tarballs under Node 22.22.2, then
  probes native ESM and gameplay snapshot encoding/decoding under Node 22.0.0
  without invoking npm or build tools. This worktree has not run GitHub Actions;
  the 22.0.0 gameplay probe still needs remote CI execution evidence. Root and
  demo build tooling still require the root engine versions below.
- Root project and build tools: `engines` requires Node >=22.22.2 <23 and npm >=10 <11. CI pins Node 22.22.2 for the workspace, application build and development tools.
- Offline package installation: install the zero-runtime-dependency local tarball from disk with npm offline, separately from development-tool installation. Phase 1 additionally tests native Node installation with an empty npm cache.
- Development-tool installation: install the consumer's locked Vite/TypeScript/React/Three.js/Playwright toolchain with `npm ci`; network/cache availability for tools is distinct from offline package installation.
- TypeScript: verify both NodeNext and Bundler resolutions using the locked tools.
- Browser bundling: build an installed consumer with Vite. A successful build does not prove every browser.
- Browser execution: the linked-development check, independent package
  consumers, narrative story smoke, and application Playwright checks use
  Chromium. The demo exercises the R3F/WebGL lifecycle and DOM/RTL narrative
  controls in Chromium; this does not establish other-browser or physical-device
  compatibility.
- Hardware: historical SwiftShader measurements are not evidence of physical Android behavior.

Risks include undeclared dependencies, declaration ESM mismatch, workspace hoisting masking imports, stale Vite linked output, deployment/precache leakage, save compatibility drift, public API instability, and CI growth. Use package-side import checks, isolated tarball installation, source watch tests, actual archive/precache inspection, existing application CI, and same-origin rollback.

The codebase can become a reusable RPG library without an engine rewrite. Phase 1 proves a core library; future 3D engine capability requires validation in Phase 2.
