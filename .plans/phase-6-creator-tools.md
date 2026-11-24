# Phase 6 — Portable RPG Creator Tools

## Baseline and audit (P6.0)

- Verified `origin/main`: `7e658199eefa308c73bb0b9662b09e1dfc467867` (PR #121 merge). The Phase 6 worktree starts from this commit.
- `waypoint-rpg-core`, `waypoint-rpg-narrative`, and `waypoint-rpg-gameplay` remain independent, root-export-only ESM packages with no runtime dependencies. Their APIs and package dependency graph are out of scope for changes.
- The shared local importer is `scripts/import-model.mjs`. It currently supports GLB and local-resource glTF, normalizes and validates the model, emits a release GLB and registry record, and has nine passing tests. It validates referenced files and then lets the parser read them again; P6.1 must parse the same bounded bytes that were validated.
- The Phase 5 scene demo owns its optional Three.js loader, integrity checks, resource leases, per-instance skeleton/mixer handling, and preview controls. Reuse that implementation behind a creator-only browser entry; do not add Three.js to the pure framework packages. Its timeline implementation is sample-private, so timeline authoring remains unavailable in the P6 manifest.
- The Kids RPG World Builder v1 is application-owned and depends on Kids-specific registries and NPC placement rules. Keep its `WorldBuilderDocument`, `documentToWorldSource`, editor, and save format unchanged. The portable project manifest uses public core DTOs through an adapter, not Builder v1.
- Phase 5 is Complete on this baseline according to the canonical roadmap and its recorded reference-demo evidence. Do not repeat Phase 5 or count the scene demo, Garden, or tool fixtures as portfolio releases.

### Baseline verification

Executed under Node v22.23.5 and npm 10.9.9:

- `npm ci` — passed.
- `npm run verify` — passed, including 565 root tests, framework builds and tests, content/assets, typecheck, and production builds. Existing draft-content (48) and placeholder-asset (5) notices and bundle-size warnings remain informational.
- `npm run framework:consumer` — passed: isolated core tarball, ESM, NodeNext/Bundler, Vite and Chromium.
- `npm run framework:narrative-consumer` — passed (24 archive files; offline install and declarations).
- `npm run framework:gameplay-consumer` — passed (33 archive files; offline install and declarations).
- `npm run framework:scene-consumer` — passed: offline three-package install, typecheck, unit tests, Vite and Chromium model/lifecycle smoke.
- `npm run framework:garden-consumer` — passed: independent source copy, offline packages, isolated ESM/declaration probes, tests, build and Chromium smoke.
- `npm run framework:watch:check` — passed cold/warm linked development using Vite default resolution, package update propagation and error recovery.
- `npm run models:import:test` initially hit sandbox `spawn EPERM`; direct execution passed 9/9 and full `npm run verify` passed when run with the required process permission.
- GitHub Actions on `7e65819`: Pages and roadmap synchronization succeeded; E2E framework and Garden jobs succeeded while four application shards were pending at audit time. Sample screenshot capture, checks and artifact upload succeeded; only the optional PR-creation step failed because GitHub Actions lacks permission to create/approve pull requests. Preserve artifacts and manual review; do not weaken branch protections.

## Selected architecture

Create one optional, private, packable ESM developer tool named `waypoint-rpg-creator`, with CLI command `waypoint-rpg`. It depends on the existing packages only as development/build inputs where needed and is not a runtime dependency of game projects. Keep the three framework packages unchanged and renderer-neutral. Put the creator-only Three.js model preview behind an optional browser entry and keep Node CLI modules out of it. Games own reducers, content, save policy, rendering, licensing approval, and experience.

The importer remains singular: `scripts/import-model.mjs` becomes a compatibility wrapper over the creator's shared importer and keeps existing flags/defaults. Catalog inspection records technical facts separately from per-game release approvals. A versioned `game.project.json` describes a game and references assets/content without a mutable global registry. Scaffolded applications import only their declared public framework roots and use relative paths/package archives.

## Dependency-ordered milestones and acceptance

### P6.1 — Portable importer

- Extend the existing importer; support GLB and glTF 2.0 with confined local dependencies. No remote fetching. FBX/OBJ/BLEND require an explicitly optional Blender conversion step and are not described as direct parser inputs.
- Validate extensions, container, bounded size/mesh/joint/texture/animation budgets, paths, symlinks/junctions, dependencies, and metadata. Feed the validated bytes to the parser. Produce deterministic, self-contained GLB and hashes while preserving rigs, skins, morph targets, materials and clips.
- Keep source clip inventory distinct from game-owned semantic mappings. Preserve current CLI flags and release approval defaults. Identical re-import is a no-op; changed assets require explicit replacement. Stage immutable hash-addressed output before an atomic catalog update; failures never leave a half-registered asset.
- Tests cover static/rigged imports, malformed input, unsafe/missing/remote resources, unsupported suffix, budgets, duplicate ID, interruption, deterministic output and compatibility wrapper. A new game imports without reaching into scene-demo source.

### P6.2 — Shared asset catalog

- Add a versioned portable catalog with stable IDs, category, source/provenance, original/runtime paths and hashes, license and redistribution evidence, converter/options, normalization, inspection metrics/budgets, warnings and consumer IDs.
- Keep immutable technical import inspection separate from game-specific review/approval. Enforce `specified → sourced/generated → imported → validated`, then per-game `approved → release-ready` evidence gates. AI-owned assets never default to CC0. Changed bytes or rights invalidate approval.
- Support shared hash-verified assets plus game-local policy without copying metadata. Test canonical serialization, schema compatibility, integrity, duplicate IDs, transitions, stale evidence and two-game references.

### P6.3 — Local model preview

- Extend Phase 5 loading, lease, mixer and preview code through a creator-only optional browser entry. Preview only technically validated local assets; clearly show that preview does not grant release approval.
- Include static/rigged load, orbit/zoom, orientation/scale/bounds, material and texture diagnostics, source clip inventory, game semantic mapping inspection, independent instances, reduced motion and resource estimates/observations when available.
- Unload/switch aborts stale requests and releases owned resources. Browser tests exercise slow load, errors, cancellation, reload, context loss/recovery, repeated mount/unmount and actual rendered screenshots.

### P6.4 — Manifest, scaffold and CLI

- Define a versioned manifest for game ID/version/name/locales, selected public package roots, single scene/map/start anchor, game-owned characters/content, asset/catalog references, semantic clips, accessibility/input, save namespace/schema, and development/build/test/preview/release commands.
- Provide create, validate, inspect, build, preview, test and capture commands using portable relative paths. Reject unsupported timeline authoring in v1. Do not adapt or mutate Kids RPG Builder v1.
- Scaffold one runnable scene using only declared packages and public package roots; include locked toolchain metadata and offline local-tarball installation path. Test Windows/Linux-safe names, spaces/Unicode, malformed manifests, package/asset refs and portable build output.

### P6.5 — Independent generated consumers

Generate two fixtures outside the monorepo using only the packed creator and framework archives:

- Narrative-only: core + narrative, two outcomes, one scene, save/reload/restart and invalid-save recovery. No gameplay installation or bundle.
- Tactical: core + gameplay, one scene, inventory/equipment, deterministic victory/defeat, reward replay protection and mid-combat restore. No narrative dependency unless exercised.

Both install only needed archives, reject deep/workspace imports, pass NodeNext/Bundler declarations, build and run Chromium acceptance, generate real source-built screenshots, test cancellation/reload/isolation/cleanup, and build after moving production output outside the checkout. Shared catalog and local assets must resolve. These are tool fixtures, not portfolio games.

### P6.6 — CI, documentation and completion

- Add focused creator/import/catalog checks and one independent generated-consumer workflow that builds/packs archives once and uses identical archives for both examples. Retain existing package, app and E2E checks without duplicating the complete browser matrix.
- Preserve generated screenshot artifacts. Make screenshot capture/reporting succeed independently of optional PR creation; retain manual review when GitHub settings deny PR creation. Never bypass protection.
- Update creator quick-start, manifest/catalog/license references, `docs/CREATING-A-SAMPLE-GAME.md`, `docs/framework-api.md`, product/framework roadmaps, and generated README via `npm run roadmap:sync`. Require `npm run roadmap:check`.
- Run `npm run verify`, `npm run models:import:test`, core/narrative/gameplay/scene/Garden consumer gates, `framework:watch:check`, creator tests, generated-game gates and focused browser checks. Confirm no change to Kids RPG save/content/PWA behavior and no optional creator/preview leakage into its production bundle or precache.
- Mark Phase 6 Complete only after both generated consumers and compatibility gates pass. Otherwise keep exact outstanding evidence gaps in the roadmap.

## Deferred work and risks

- Five portfolio releases, a full drag-and-drop editor, direct FBX/OBJ/Blender parsing, provider APIs, AI subscriptions, generic timeline authoring, shared game runtime state, and changes to the pure package APIs are out of scope.
- The locked browser/dev toolchain may require an online cache bootstrap; offline package installation is distinct from offline tool installation. Document this explicitly.
- CI cannot create preview PRs under current repository settings. Artifact-based manual review is the fallback; the implementation must not claim automatic publication.

## Milestone execution record

### P6.1 — Portable importer

Implemented `waypoint-rpg-creator` as a packable ESM workspace with the
`waypoint-rpg asset import` CLI. The existing `scripts/import-model.mjs` is a
compatibility wrapper retaining the scene-demo defaults. The importer now feeds
the same validated in-memory glTF JSON and dependency bytes to NodeIO, confines
local resource paths through realpath checks, rejects external GLB references,
and stages both output and registry before committing with rollback. Technical
imports can be inspected without release approval; the legacy entry point still
requires approval by default.

Verification: `npm run creator:test` passed 15/15; `npm run creator:build`,
`npm run lint`, and the scoped Prettier check passed. `npm run
creator:import-consumer` passed after a locked developer-toolchain install and
warm-cache offline reinstall. The packed creator then installed offline and
imported the static-textured and rigged fixture from a separate generated
project directory, without the gameplay package or scene-demo source.

### P6.2 — Shared asset catalog

Added the creator package's versioned `asset-catalog` public export. Catalog
records keep immutable technical inspection and shared consumer IDs on the
asset, while each game's rights review and release evidence live in a separate
approval record pinned to the runtime SHA-256. Readiness transitions are
validated; changed bytes make existing approval evidence stale. File
verification confines source/runtime/evidence paths to the catalog root,
checks source and output hashes, and rejects symlink escapes. AI-generated
ownership remains explicit and never implies CC0.

Verification: `npm run creator:test` passed 21/21 (15 importer and 6 catalog
tests); `npm run creator:build` passed its package-root and boundary checks.
`npm run creator:import-consumer` packed and installed the creator archive
offline outside the checkout, exercised public root and catalog exports,
rejected a deep import, type-checked the declarations under NodeNext and
Bundler resolution, and imported both static and rigged GLBs. Catalog tests
cover canonical round-trip, schema/duplicate/unsafe-key errors, ordered stage
gates, per-game approvals, stale hash rejection, and path/hash verification.

### P6.3 — Local model preview

Added an optional browser preview app under `tools/creator/preview/`. It reuses
the Phase 5 model loader, integrity checks, lease ownership and independent
skeleton cloning. The local UI displays provenance and rights without changing
catalog approval, source clip inventory and semantic mappings, bounds,
materials/textures, decoded memory estimates and observed renderer resource
counts. It supports orbit/zoom, two independent instances and reduced motion.
The local Vite server can read a selected game's asset manifest and public
models without adding those preview assets to the Kids RPG production bundle.

The preview aborts stale loads and releases leases on model changes and
unmount. Renderer context-loss listeners are attached when the canvas is
created, removed before deliberate reload, and cleaned on unmount. Loader
replacement no longer clears the renderer probe while the canvas remains
mounted. Chromium verifies local manifest loading, remote URL rejection,
integrity failures, a delayed load superseded by another selection, three
reload cycles, separate skeleton objects, orbit/zoom, reduced motion, and real
WebGL context loss/recovery. The generated browser screenshot is
`docs/previews/creator/rigged-asset-preview.png`.

Verification: `npm run creator:preview:typecheck`, `npm run creator:preview:test`
(4/4 Chromium tests, including SwiftShader context loss/recovery),
`npm run creator:preview:build`, and `npm run lint` passed. The preview build
reports a 1.18 MB development-tool chunk (323 kB gzip); this is isolated from
game production bundles. ESLint reports five React Fast Refresh warnings for
local preview components and no errors. The targeted Prettier check passed.

### P6.4 — Manifest, scaffold and CLI

Added the versioned `game.project.json` contract and public
`waypoint-rpg-creator/game-project` API for validation, inspection, creation,
and execution of fixed project scripts. `waypoint-rpg game create|validate|
inspect|dev|build|test|preview|capture` generates a one-scene React/R3F game
from local framework tarballs. The starter owns its state, scene, accessible DOM
control, tests, and release policy; it imports only `waypoint-rpg-core` and does
not copy either sample's private runtime. Timeline authoring is explicitly
rejected until a public runtime contract exists. Creation is atomic, refuses to
overwrite, validates path confinement and local package metadata, and writes
deterministic lockfiles with pinned developer tooling. Documentation now
distinguishes offline package installation from the one-time cache bootstrap
that may be needed for development tools.

The first generated-project run found two template issues before acceptance:
TypeScript 6 needed Vite's ambient client declarations for the CSS import, and
Vitest's default scan included the separate Playwright spec. The template now
ships `src/vite-env.d.ts` and scopes `npm test` to `src`; browser capture remains
the separate `npm run capture` command.

Verification: `npm run creator:test` passed 27/27; `npm run creator:build` and
`npm run creator:import-consumer` passed. From a temporary path outside the
checkout, the generated project installed with `npm ci --offline` (142 packages
from the populated cache), built, passed 2/2 Vitest tests, and passed 1/1
Chromium Playwright capture. Its real source-rendered screenshot is
`docs/previews/creator/generated-single-scene.png`. The starter build reports an
approximately 1.09 MB JavaScript chunk (297 kB gzip); this is the optional
developer template and should be measured again when a production game chooses
its modules and assets.

### P6.5 — Independent generated consumers

Added `npm run framework:generated-games`. It builds and packs the core,
narrative, gameplay, and creator archives once per run, then reuses those exact
archives for the creator CLI host and both generated applications. The CLI is
installed into an isolated temporary host; it generates narrative-only and
tactical-only projects outside the repository. Each project then receives a
small game-owned fixture, imports the same local static textured GLB as a
shared asset and a distinct game-local asset, and writes a hash-verified
technical catalog without release approvals. No preview or tooling step turns
technical validation into commercial approval.

The narrative consumer depends only on core+narrative and exercises two
distinct outcomes, Persian RTL, keyboard navigation, reload/restart, and
corrupt-save recovery with original-byte preservation. The tactical consumer
depends only on core+gameplay and exercises inventory/equipment, a declared
starting ability, deterministic victory/defeat/withdrawal, mid-combat restore,
reward deduplication, and corrupt-save recovery. The gate asserts that omitted
package roots are not installed, rejects deep imports, scans for workspace or
sample-private imports, and type-checks declarations under both NodeNext and
Bundler. Both games install offline outside the checkout, build, pass their
unit tests, and pass rendered Chromium acceptance. The same shared catalog
record is verified in both games and contains both consumer IDs; each game
also retains its own local asset record.

On Windows, Node's `os.tmpdir()` returned an 8.3 short path that Vite rejects
for security. The gate canonicalizes the OS temp root with `realpath`, keeps
each Vite filesystem allow list scoped to that game, and disallows reuse of an
unrelated dev server. The starter output element is block-laid out so ending
controls do not overlap it. Real Chromium captures are
`docs/previews/creator/generated-narrative-consumer.png` and
`docs/previews/creator/generated-tactical-consumer.png`.

Verification: `npm run framework:generated-games` passed after these fixes;
both consumers passed local tarball installation, NodeNext/Bundler declarations,
production build, unit tests, Chromium browser tests, save/reload assertions,
catalog integrity, and screenshot capture. Root creator/package and broader
compatibility gates are recorded under P6.6 below.
