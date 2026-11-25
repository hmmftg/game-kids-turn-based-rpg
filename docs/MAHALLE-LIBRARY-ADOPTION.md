# محله مهربانی — library adoption and visual sample

## Purpose

Keep **محله مهربانی (Mahalle-ye Mehrabani)** as the repository's real, maintained
reference game for the optional RPG libraries. It remains the production
application **at the repository root**; the README gallery lists that same
application as a playable sample. Do not duplicate or fork it under `examples/`
merely to call it a sample.

The goal is a demonstrably library-backed game, not an unrelated screenshot
prototype. Its game-specific product policies still belong to the game.

## Audited integration status

<!-- prettier-ignore -->
| Capability | Current owner and evidence | Adoption status |
| --- | --- | --- |
| Runtime | `src/app/gameRuntime.ts` delegates to `createGameRuntime` through `src/framework/index.ts`, which re-exports the public `waypoint-rpg-core` root. | **Adopted** |
| World IDs / graph / pathfinding | `src/world/navigation/graph.ts` re-exports generic helpers from core; world geometry, anchors, arrival, and interaction ownership remain application data and policy. | **Adopted** |
| Narrative / quests | `src/domain/game/narrative.ts` compiles all nine authored quests and dialogue nodes with `waypoint-rpg-narrative`; reducer progression uses its transition API and derives the legacy v3 quest projection from package state. | **Adopted with repeatable-quest compatibility** |
| Child encounter choreography | `src/domain/quests/encounter.ts`, `src/content/fa/`, stickers, checkpoints, physical choices, and gentle retries. | **Application-owned by design** |
| Micro-battle rules | `packages/gameplay/src/lightweight-encounter.ts` exports the optional generic deterministic 1v1 state machine through `waypoint-rpg-gameplay`; `src/domain/battle/adapter.ts` supplies Mahalle content and projects state to the existing child UI. | **Adopted; no tactical-grid replacement** |
| Profiles / persistence | `ProfileCoordinator`, `SaveCoordinator`, IndexedDB v2, and persisted schema v3 remain the storage owners; narrative progress is restored from and projected to the existing quest fields. | **Core contract; app-owned implementation and compatibility adapter** |
| 3D renderer | `src/world/WorldCanvas.tsx`, game models, camera, quality tiers, and physical semantic animation. | **Game-owned; no public renderer package** |
| Asset catalog | `assets/mahalle-asset-catalog.json` is generated from `src/services/assets/registry.ts` with the Phase 6 creator catalog API and measured GLB budgets. The original source packs are not in the repository, so creator readiness remains `specified`; root asset validation remains the release gate. | **Creator catalog integrated; approvals not inferred** |
| Installed-package consumer | `npm run framework:mahalle-consumer` copies the real root app outside the checkout and builds it against the three packed, installed public package archives. The `mahalle-library-consumer` job runs the gate in CI. | **Independent consumer gate** |
| Screenshot evidence | `e2e/sample-previews.preview.ts` captures the real production root app and the existing sample gallery workflow publishes captures for review. | **Source-rendered** |

**Repeatability contract:** The child game intentionally permits completed
quests to be replayed while preserving the original completion count and
completed step IDs. The narrative package now supports a game-authored
repeatable quest policy and completion history; it owns durable generic quest
state, while Mahalle still owns the physical child-action choreography,
pictograms, rewards, checkpoints, and non-punitive retry rules. Replaying and
then abandoning a previously completed quest must leave its completed history
intact.

## Migration architecture

- `src/app/gameRuntime.ts` hosts the application reducer in the core runtime.
- `src/domain/game/narrative.ts` compiles the stable quest, dialogue, trigger,
  and prerequisite IDs; transitions use `transitionNarrative` and the public
  narrative root. Persian copy and NPC policy remain in `src/content/fa/`.
- `src/domain/game/reducer.ts` is the only application command boundary. It
  checks avatar, mode, authored content, and encounter eligibility before
  accepting narrative or gameplay transitions.
- `src/domain/quests/encounter.ts` owns the child-specific
  `intro → demonstrate → playerChoice → worldResponse → reinforce → complete`
  choreography. Only an accepted correct physical choice completes a package
  quest step; wrong choices and demonstration beats do not write narrative
  progress.
- `src/domain/battle/adapter.ts` translates app-authored battle definitions to
  `waypoint-rpg-gameplay`. The package state is the sole battle state. App-owned
  action IDs, deterministic intent patterns, weaknesses, Persian copy, and
  discovery-at-exit policy stay outside the package.
- `GameState.quests` is a derived compatibility projection for existing UI and
  schema-v3 saves. Narrative state is authoritative in memory. The package
  snapshot itself is not added to IndexedDB, so restore cannot replay effects
  or re-award stickers.
- Active dialogue, child encounter choreography, and micro-battles remain
  transient. Profiles, storage recovery, checkpoints, and stable snapshots stay
  in the existing app coordinators.

## Phase 6 asset catalog

`assets/mahalle-asset-catalog.json` records all 24 shipped GLB models with
source references, license metadata from the existing registry, runtime hashes,
intended use, and measured file/geometry budgets. Regenerate or verify it with
`npm run creator:mahalle-catalog:write` and `npm run creator:mahalle-catalog`.
The catalog uses the creator package's public catalog schema and validator;
it adds no runtime creator dependency and does not replace the root game's
asset hash/release checks. Creator stage stays `specified` because original
source packs are not checked in and the creator importer has not validated
those source bytes. Two legacy model entries still record an unknown license;
the catalog leaves them unapproved and flags their rights review as unverified.
No asset conversion, quality tier, or renderer behavior changed in this
migration.

## Completed migration evidence

Final local verification on 2026-11-25 passed:

- `npm run verify`: formatting, generated roadmap check, lint (0 errors; 7
  existing Fast Refresh warnings), 15 model-import tests, creator catalog,
  package boundaries/builds, core (15), narrative (40), and gameplay (35)
  package tests, TypeScript, 577 root unit tests, migration contracts,
  content/asset validation, production build, bundle budgets, deployment
  shape, and the existing hello-world and scene-demo builds.
- `npm run framework:mahalle-consumer`: passed with the copied root app and
  three independently packed archives installed offline outside the checkout;
  root-only ESM imports, NodeNext/Bundler declarations, root typecheck and unit
  tests, content/assets, production/deploy budgets, and Chromium quest gameplay
  all passed.
- Independent consumers passed for core, narrative, gameplay, scene-demo, and
  Garden; generated narrative-only and tactical-only consumers passed; the
  linked development watch/recovery check passed.
- The four Kids RPG Chromium shards passed **257 tests**, with **13 expected
  skips** for separately gated or viewport-specific cases. The dedicated
  release rollback check passed **1/1**.
- `npm run creator:preview:test` passed **4/4**, including independent rig
  rendering, context recovery, manifest validation, and stale-load cancellation.
- `npm run format:check`, `npm run roadmap:check`, and
  `npm run creator:mahalle-catalog` passed.

The three framework package manifests declare Node `>=22.0.0`; their native
runtime and installed-tarball checks ran under Node 22.23.5. The repository
development toolchain declares Node `>=22.22.2 <23` and npm `>=10 <11`, and its
locked install and builds ran under that newer toolchain. The exact Node 22.0.0
binary was not separately exercised. No physical mobile device was tested;
browser evidence is Chromium with software WebGL. Root educational and religious
content still has draft warnings, and the asset catalog retains two unverified
legacy license entries without approving them.

`npm run sample:previews` passed **1/1** against the production build after the
implementation commit. It captured all seven states at source SHA
`737f2bb2124c3cfa90091e8a661e6e7d24312776`; dimensions, byte sizes, and SHA-256
hashes are recorded in `docs/previews/legacy-sample/provenance.json`:

- `01-title.png`, `02-avatar-select.png`, `03-headwear-select.png`
- `04-town-hub.png`, `05-town-portrait.png`
- `06-guardian-dialogue.png`, `07-encounter-choice.png`

The sample gallery validator passed after capture, and the README gallery keeps
Mahalle at the repository root while listing it as the production playable
reference.

## Visual preview pipeline

`npm run sample:previews` runs Playwright against `npm run preview` of the
**root game's actual production build**. It captures onboarding, town hub in
landscape/portrait, NPC dialogue and a quest encounter. The script uses actual
browser navigation and parent-gated quality settings. The screenshot runner is
excluded from the normal `*.spec.ts` E2E shards.

After every push/merge to `main`, `.github/workflows/sample-previews.yml`:

- installs the locked tools and Chromium plus an emoji-capable font;
- builds the root game and runs the sample preview scenario;
- publishes the PNGs as a GitHub Actions artifact even if a documentation PR
  cannot be created;
- creates or updates a **reviewable PR** containing the screenshots and
  README gallery, instead of committing directly to protected `main`.

Images are visual documentation, **not golden pixel assertions**. Small GPU,
font or browser rendering changes can produce changed PNGs; compare them in
the PR before merging. The captured app's educational/religious content may
still be draft and must not be represented as reviewed or approved.

## Acceptance criteria for calling the game a full library sample

- The actual app imports installed public package roots and passes an isolated
  tarball consumer build (not merely a Vite workspace-linked build).
- Domain behavior migrated to optional libraries has explicit equivalence
  tests for outcomes, repeated play, save/load and game-specific policies.
- No second source of truth for progression or persistent state.
- The original child experience, quality levels, parent controls, RTL,
  reduced motion, offline mode, assets and save compatibility are preserved.
- Playwright captures are generated from the same tested source commit.
- Every reusable library can still be consumed independently of this game.

**Current classification:** the production root game is a core + narrative +
gameplay library-backed reference consumer. The renderer, profile/save
coordinator, child-facing story policy, asset release policy, and PWA remain
application-owned because they are specialized product behavior.

## Post-merge hardening evidence — PR #125

Hardening baseline: merged PR #125 at `7832aaf1ffd6beabf0693812971c50ff48d1858c`. Work was completed in the isolated `codex/mahalle-migration-hardening` worktree.

### H1 — Interrupted quest restore

The application restoration boundary now normalizes a persisted active attempt that has no live encounter: first attempts become cancelled; attempts with completion history return to completed. It retains completed step IDs, counters, stickers, prerequisites, and prior rewards. Encounter-exit paths for hub/map/profile changes were audited so transient choreography cannot leave a permanently active narrative attempt. The generic narrative package's active-attempt rejection remains unchanged. Focused reducer/coordinator/save tests passed: 100 tests across four files, including legacy v2/v3 restores, encounter exit, reload, replay, and availability.

### H2 — Profile persistence ordering

`ProfilePersistenceQueue` now orders writes, resets, and deletes per profile and uses slot epochs/lifecycle generations to reject obsolete completions. A queued write cannot recreate deleted data or overwrite reset progress; a reset for an old selection cannot affect the newly selected profile. Ordinary profile switches still flush legitimate pending progress. Deterministic delayed-repository race tests pass. IndexedDB and the persisted schema remain unchanged.

### H3 — Migration screenshots

The existing production Playwright capture and README gallery generator now produce 13 Mahalle captures. The six new states are completed physical interaction, sticker reward, completed quest replay, real micro-battle, persistent discovery, and restored profile progress. All PNGs and checkpoint records validate; source SHA and per-image hashes are in `docs/previews/legacy-sample/provenance.json`. The current 13-image capture records source commit `8b5d07e4a3164756f9435cf96dfe5d34ebd579ab`. `npm run sample:gallery` and `npm run roadmap:check` pass.

### H4 — Consumers, browser evidence, and CI review

- The native runtime smoke now exercises repeatable narrative quest history and snapshot decoding, plus a real lightweight encounter through the gameplay package's public root. Core, narrative, and gameplay archives were packed, installed offline into an isolated consumer, and probed on the exact Node `22.0.0` runtime. ESM, source-map, progression, quest replay, encounter victory, and snapshot checks passed. This verifies the runtime floor; the root development toolchain still requires Node `>=22.22.2 <23`.
- Independent core, narrative, gameplay, scene-demo, Garden, and Mahalle consumers passed locally. The Mahalle consumer built the copied root game against the three offline installed archives and passed its Chromium gameplay check.
- The historical Phase 5 move clip was only 0.5 seconds, shorter than a potentially slow full-page screenshot. The procedural fixture now has a 2.5-second registered move clip. The before/after assertions that require the real gameplay-driven `move` action to be active were retained. `npm run sample:scene:previews` passed: Blood Leaf captures and all nine production Phase 5 captures. The updated Phase 5 manifest records 153 rendered move frames, a 3-frame first-render delta, zero idle model frames, and stable renderer counts across five warmed scene round trips (geometries 6→6, textures 1→1; tolerance +1 each). No GPU memory statistics were inferred.
- `npm run verify` passed: 588 root tests across 62 files, 15 core, 40 narrative, 35 gameplay, 15 model-import tests, five Mahalle migration contracts, typechecking, content/assets, package boundaries, builds, budgets, and deployment shape. Lint had zero errors and seven existing Fast Refresh warnings. Creator preview typecheck/build and Chromium tests passed 4/4. Six focused save/replay/profile/offline/corruption/battle E2E tests passed. The same-origin upgrade/rollback Playwright test passed 1/1 against the migration baseline.
- The catalog freshness checker now normalizes CRLF/LF before comparing generated JSON. This fixes a Windows `core.autocrlf` false stale-catalog failure; the asset catalog data was not rewritten, and unknown-rights entries remain unapproved.
- GitHub diagnostics for PR #125 head `93841791ba6ea125bb405b1b28ad3c25d20836d4` show `verify`, the framework and Mahalle consumers, Garden consumer/gameplay E2E, creator/generated consumers, and E2E shards 1–4 succeeded. The screenshot `capture` job was **cancelled** (Actions run `45559161104`); the `synchronize` check was skipped. The canceled run is not a passing screenshot CI result. No hosted run covers these local hardening commits because they were not pushed.

Screenshots were tested on Windows x64 using headless Chromium with SwiftShader. Physical mobile GPUs and other browser engines remain untested. Root educational content and placeholder-asset warnings remain under the repository's existing draft policy.
