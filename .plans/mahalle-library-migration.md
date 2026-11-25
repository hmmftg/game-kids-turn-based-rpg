# Mahalle Library Migration — Execution Plan

**Baseline:** `origin/main` at `f0b792d0be00132c7ac862bbc4704c5fdebc7070`  
**Branch:** `codex/mahalle-library-migration`  
**Target:** Keep the production root game in place and promote it in the README sample gallery as the library-backed production reference.  
**Approved migration scope:** The user approved the supplied M0–M7 migration prompt and selected “promote within Samples” rather than physically moving the root application.

## Goals and constraints

- Make `waypoint-rpg-core`, `waypoint-rpg-narrative`, and `waypoint-rpg-gameplay` the independently installed public package dependencies of the actual root game.
- Keep Persian copy, physical interaction policy, educational choreography, authored battle data, rendering, PWA, audio/quality preferences, and profile/save coordination game-owned.
- Preserve all nine quest IDs/steps, prerequisites, replay counts, stickers, discoveries, battle phases and deterministic outcomes.
- Keep IndexedDB schema v2 and persisted payload schema v3 where a lossless projection is possible; migrate v1/v2/v3 fixtures without re-awarding historical effects.
- Never move the root application to `examples/`, import package internals, or let package code import Mahalle.
- Keep active encounters, dialogue cursors, and battle choreography transient as before.

## Architecture decisions

1. **Narrative repeatability:** Add an explicit repeatable quest policy and durable generic quest history (completed step IDs and completion count) to narrative state. Decode legacy narrative snapshots compatibly. A fresh restore path will accept validated initial facts/quest progress without replaying narrative effects. The application will derive its existing `PersistedState.quests` projection from this state.
2. **Mahalle encounter choreography:** Keep `intro → demonstrate → playerChoice → worldResponse → reinforce → complete` and all child-facing policies in Mahalle. Valid completed physical choices are the only adapter boundary that advances generic quest history.
3. **Micro-battle engine:** Add a game-neutral, optional lightweight encounter module under `packages/gameplay`, exported from its public root and independent of the tactical grid module. Preserve Mahalle action IDs, authored intent patterns, weaknesses, reactions, achievements and discovery-at-exit policy in the app.
4. **Profile identity and persistence:** Derive narrative playthrough identity from the selected profile ID; guest play uses a stable app session identity. Keep profile/save coordinators as the only storage owners. Add async generation guards only where tests demonstrate stale-profile writes/selections.
5. **Sample presentation:** Update the existing gallery source and regenerate the README. Do not move the root app into `examples/`.

## Capability and ownership matrix

| Capability                                                                         | Current owner                                                | Target                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Runtime/reducer contract, graph navigation, IDs                                    | Core package (already consumed via `src/framework/index.ts`) | Remain core-backed                                                    |
| Generic conditions, dialogue cursor, typed facts, quest transitions, replay checks | Mahalle domain/reducer                                       | Narrative package                                                     |
| Persian dialogue copy, pictograms, educational rules, physical step choreography   | Mahalle content/domain                                       | Remain app-owned; effects enter through validated narrative commands  |
| Quest status/count/completed-step persistence                                      | Legacy `PersistedState.quests`                               | Narrative state authoritative at runtime; lossless v3 save projection |
| Tactical grid combat                                                               | Gameplay package                                             | Unchanged optional capability                                         |
| 1v1 child micro-battle                                                             | `src/framework/modules/battle`                               | Generic mechanics in gameplay package; child policy remains app-owned |
| Profiles, IndexedDB, checkpoints, storage recovery                                 | App coordinators                                             | Remain app-owned                                                      |
| Three.js/R3F, semantic physical animation, asset pipeline                          | Root app                                                     | Remain app-owned unless proven safe to adopt                          |
| Creator tooling                                                                    | Existing workspace tool                                      | Catalog only assets with provenance and measured budgets              |

## Package dependency diagram

```text
Mahalle root application
  ├── waypoint-rpg-core (runtime + world/navigation)
  ├── waypoint-rpg-narrative (authored dialogue + quest transitions)
  ├── waypoint-rpg-gameplay (optional lightweight encounters)
  ├── Mahalle content/policies + physical encounter choreography
  ├── ProfileCoordinator / SaveCoordinator / IndexedDB
  └── game-owned React, Three.js/R3F and PWA
```

## Test matrix

- Narrative package public API: repeatable completed quests, failed/cancelled restart, quest history, immutable stale rejection, decode old/new snapshots, no replayed effects.
- Gameplay package: differential legacy-vs-library fixture covering every action, intent, forced intent, weakness, round/phase, victory/defeat, achievements and invalid command.
- Root reducer: nine quest flows and repeat replay, wrong choice retry, abandon, prerequisites, stickers/abilities, physical phase order, battle discovery boundary.
- Save/profile: v1/v2/v3 parse, round-trip projection, corruption/newer-version retention, no reward replay, profile isolation, out-of-order select/save completion, reset.
- Installed consumer: three packed tarballs, offline install outside checkout without workspace symlinks, root imports only, NodeNext/Bundler declarations, root app typecheck/content/assets/build/budget/deploy and Chromium tests.
- Browser/product: landscape and portrait shards, previews, offline/PWA rollback, parent/pause, accessibility, reduced motion, map and battle regressions.
- Repository: verify, all independent consumers, creator preview, previews, roadmap check.

## Tasks

### Task 1 — M0: Baseline contracts and parity fixtures

- Record actual baseline outcomes and current owners.
- Add deterministic fixtures for quest and micro-battle behavior before migration.
- Record all protected compatibility constraints.
- **Expected:** focused legacy fixtures pass unchanged; plan states exact old behavior to preserve.

### Task 2 — M1: Independent installed-package root-game consumer

- Pack the built public archives and create an isolated root-game consumer outside the repository.
- Remove workspace links, install locked dev dependencies and the archives, and build/test the copied real app.
- Add `framework:mahalle-consumer` and CI integration.
- **Expected:** no deep imports or source aliases; archive-only build and representative Chromium gameplay pass.

### Task 3 — M2: Narrative compatibility and quest-greeting pilot

- Add repeatable quest attempts and generic completion history to the narrative package.
- Add backward-compatible state decoding and validated rehydration.
- Migrate only greeting through package transitions and prove full pilot parity.
- **Expected:** greeting start/complete/replay maps to the same quest/sticker/checkpoint projection; all narrative consumers remain green.

### Task 4 — M3: Remaining dialogue and quest migration

- Author nine quests and NPC dialogue through the narrative package while retaining physical pedagogical choices in Mahalle.
- Route every accepted generic progression change through narrative transitions; derive legacy selectors/save projection.
- Remove the replaced quest progression writers.
- **Expected:** all nine quest IDs/steps/rewards/replay prerequisites remain equal; one authoritative progression model remains.

### Task 5 — M4: Lightweight reusable encounter mechanics

- Add generic 1v1 deterministic encounter definitions and transitions to the gameplay package public root.
- Add differential tests for every current action and representative battle definitions.
- Switch the Mahalle adapter after the differential suite passes; remove legacy duplicate rules.
- **Expected:** identical phase sequence, hearts, outcomes, intent, forced intent, achievements, invalid-command no-ops and discovery-at-exit behavior.

### Task 6 — M5: State ownership and save/profile compatibility

- Build and restore narrative progression through a deterministic adapter to the existing save envelope.
- Guard profile selection and save metadata against stale async completion when demonstrated by tests.
- Add historical fixtures and rollback/idempotence tests.
- **Expected:** persisted schema remains v3 if lossless; all old values restore without reapplying rewards; no cross-profile leakage.

### Task 7 — M6: Creator catalog and justified renderer adoption

- Audit the creator/asset registry and current model/animation boundary.
- Add only provenance/readiness/runtime-budget catalog evidence supported by shipped assets.
- Adopt shared presentation code only if it preserves the physical semantic animation contract and measured quality budgets.
- **Expected:** existing asset conversion, camera, PWA/offline, WebGL recovery and quality tiers are unchanged.

### Task 8 — M7: Full regressions, screenshots and documentation

- Run four Kids RPG Playwright shards, all package consumers, creator preview and existing screenshot captures.
- Update `docs/MAHALLE-LIBRARY-ADOPTION.md`, sample gallery source, README matrix, and generated roadmap.
- Capture genuine post-migration previews and provenance.
- **Expected:** all required gates pass; any baseline/external failure is separately named; docs only claim demonstrated adoption.

## Baseline results (before source changes)

- HEAD and `origin/main`: `f0b792d0be00132c7ac862bbc4704c5fdebc7070`.
- `npm run verify`: blocked at baseline `format:check` by `tools/creator/src/cli.mjs`.
- `npm run roadmap:check`: baseline stale generated README; to be regenerated after gallery changes.
- `npm run lint`: passed with 7 pre-existing React refresh warnings.
- `npm run models:import:test`: passed 15/15 when run outside the Windows spawn restriction.
- `npm run framework:check`, `framework:build`: passed.
- Core/narrative/gameplay prepared tests: passed 15/34/29.
- Narrative installed consumer: passed offline, ESM, NodeNext and Bundler probes.
- Root typecheck: passed.
- Root Vitest: passed 580 tests / 61 files.
- Root build: passed validators, TypeScript, Vite, budgets and deployment checks; informational draft/placeholder/large-chunk warnings remain.
- Full baseline Playwright shards and `sample:previews`: not yet run.

## Review focus

- No package imports Mahalle content or app code.
- No duplicate writer for quest or encounter progression.
- No child-facing copy or physical interaction semantics move into packages.
- Restore never replays effects or grants rewards.
- Profile changes cannot accept stale loads or save metadata callbacks.
- Existing save bytes remain available after corruption, newer versions or failed migration.
- Consumer uses installed tarballs only and does not resolve workspace source.
- Any status/gallery claims are backed by actual test and screenshot evidence.

## Execution and acceptance results

Implementation commit: `737f2bb2124c3cfa90091e8a661e6e7d24312776`.

- All nine authored quests now use the narrative package as the authoritative
  progression state, with repeatable completion history projected losslessly
  into the existing schema-v3 save fields. No narrative effects replay during
  restore.
- Mahalle's specialized child micro-battle rules were replaced by the optional
  generic deterministic 1v1 module in `waypoint-rpg-gameplay`. Mahalle retains
  its authored actions, intent policy, physical reactions, and
  discovery-at-victory-exit boundary. The previous application-local battle
  engine was removed after differential outcome checks.
- The actual root application passed the isolated three-tarball consumer; all
  five existing package/sample consumers, generated-game consumers, and the
  linked-development watch/recovery gate passed.
- `npm run verify` passed, including 577 root unit tests, 15 core tests, 40
  narrative tests, 35 gameplay tests, migration contracts, validators,
  budgets, deploy shape, and existing example builds.
- Four Kids RPG Chromium shards passed 257 tests with 13 expected skips. The
  separately gated release rollback test passed 1/1. Creator preview browser
  tests passed 4/4.
- `npm run sample:previews` passed 1/1 and captured seven production-rendered
  images at source SHA `737f2bb2124c3cfa90091e8a661e6e7d24312776`; the PNG
  provenance manifest records dimensions, byte sizes, and SHA-256 hashes.
- `README.md` lists the root Mahalle application in Samples / Playable Games;
  `npm run roadmap:check` and the sample gallery validator pass without moving
  roadmap phase statuses.
- Root toolchain verification ran under Node 22.23.5, while framework package
  engine declarations remain `>=22.0.0` and the root toolchain requirement is
  `>=22.22.2 <23`. The exact Node 22.0.0 runtime was not separately run.
- Browser coverage was Chromium with software WebGL; physical mobile hardware
  remains unverified. Existing draft-content warnings and two unverified legacy
  model-license entries remain as before.

### Task status

- Task 1 — M0 baseline and parity fixtures: complete (`dae97a8`, `3b02fcc`).
- Task 2 — M1 independent installed-package consumer: complete; included in
  implementation commit `737f2bb`.
- Task 3 — M2 repeatable narrative contract and pilot: complete (`6e17d7c`,
  `f7fba52`, `92a0310`).
- Task 4 — M3 full narrative migration: complete; included in `737f2bb`.
- Task 5 — M4 generic micro-battle package migration: complete; included in
  `737f2bb`.
- Task 6 — M5 state/save compatibility: complete; existing v3 payload shape
  remains unchanged and migration/restore contract tests pass.
- Task 7 — M6 catalog and renderer boundary review: complete; catalog is
  generated, unknown rights stay unapproved, and renderer remains game-owned.
- Task 8 — M7 regression, screenshot, and documentation acceptance: complete;
  final documentation/evidence commit is recorded in the handoff.

## Post-merge hardening execution record — PR #125

Baseline was rechecked at merge commit `7832aaf1ffd6beabf0693812971c50ff48d1858c` in a separate `codex/mahalle-migration-hardening` worktree. No source changes were made in the original checkout, and no push or PR was created.

### H1 — Interrupted quest restoration

- Normalize abandoned legacy active attempts at the application restore boundary without weakening generic narrative transition guards.
- Audit `ENTER_HUB`, map changes, profile switching, and other encounter-exit paths.
- Preserve quest history, completion counts, completed steps, stickers, and prerequisite availability.
- Result: focused coordinator/reducer/narrative/save tests passed (100 tests across four files); migration contracts passed 5/5.
- Commit: `337faee3e3f409511228700658153103e2b00bdd`.

### H2 — Persistence races

- Add a shared per-profile queue for save, reset, delete, load, and list work, plus slot epochs and lifecycle guards.
- Reproduce delayed repository races and prove stale writes cannot undo reset/delete or alter a newly selected profile. Preserve legitimate writes during ordinary profile switching.
- Result: deterministic delayed-repository tests and the focused H1/H2 suite passed; save schema and IndexedDB contracts did not change.
- Commit: `337faee3e3f409511228700658153103e2b00bdd`.

### H3 — Source-rendered Mahalle evidence

- Extend the existing preview route and gallery generator with six gameplay checkpoints; retain the original seven captures.
- Result: `npm run sample:previews` passed 1/1 in 2.5 minutes and produced 13 validated PNGs with source SHA and per-image SHA-256 checkpoint provenance. `npm run sample:gallery` and `npm run roadmap:check` passed.
- Preview source SHA: `8b5d07e4a3164756f9435cf96dfe5d34ebd579ab`.
- Commits: `7c2b2010a7262965f0d29a82e0319c48f420017a` (capture scenario) and `fa29f680f50a92017af821a33ea8b0d3062c3842` (gallery and captures).

### H4 — Remaining gates

- Expanded the copied runtime probes for repeatable narrative quests and lightweight encounters; corrected the output assertions in the runtime probe harness.
- Packed all three compiled packages, installed the archives offline into a temporary consumer, and passed the full native runtime smoke on Node `22.0.0` with `FRAMEWORK_EXPECT_RUNTIME_NODE=22.0.0`. The development toolchain remains on Node 22.23.5, above the repository floor.
- Extended the deterministic Phase 5 fixture's registered move clip from 0.5 to 2.5 seconds. The capture still asserts the accepted gameplay move is active before and after the actual browser screenshot. The Phase 5 provenance reports 153 move frames, idle frame delta 0, five warmed map round trips, renderer geometry/texture counts stable at 6/1, and 10 disposed scenes.
- Result: `npm run sample:scene:previews` passed all Blood Leaf and Phase 5 captures; `npm run sample:previews` passed 13 real source-rendered Mahalle states. The Phase 5 and Mahalle manifests record source SHA `8b5d07e4a3164756f9435cf96dfe5d34ebd579ab`.
- The full `npm run verify` passed: 588 root tests / 62 files, 15 core, 40 narrative, 35 gameplay, 15 asset importer, five migration contract assertions, typecheck, production builds, budgets, deployment checks, and existing examples. The catalog checker was made CRLF/LF tolerant after confirming `core.autocrlf` caused a false stale-catalog result on Windows; no catalog entries or approvals changed.
- Independent `framework:consumer`, narrative prepared consumer, `framework:gameplay-consumer`, `framework:scene-consumer`, `framework:garden-consumer`, and `framework:mahalle-consumer` passed. The creator preview typecheck/build and Chromium suite passed 4/4.
- Focused Chromium save/replay/profile/offline/corrupt-save/transient-battle regressions passed 6/6. Same-origin release upgrade/rollback against `7832aaf` passed 1/1.
- `npm run roadmap:check` passed. The PR #125 diagnostic snapshot on head `93841791ba6ea125bb405b1b28ad3c25d20836d4` had successful verification, all four E2E shards, framework/Mahalle/Garden consumers, and creator/generated consumers. Its screenshot capture job was cancelled (run `45559161104`) and its synchronization check was skipped. Those statuses describe the merged PR baseline, not the local hardening commits. The local branch was not pushed, so GitHub Actions has not verified these new commits.

### Scoped commits

- `337faee3e3f409511228700658153103e2b00bdd` — quest restore and profile persistence.
- `7c2b2010a7262965f0d29a82e0319c48f420017a` — production capture checkpoints.
- `fa29f680f50a92017af821a33ea8b0d3062c3842` — source-rendered Mahalle gallery.
- `8b5d07e4a3164756f9435cf96dfe5d34ebd579ab` — runtime-floor probes and Phase 5 capture timing.

The remaining local documentation/evidence commit records the final test run and screenshots. No browser or GPU claim extends beyond Windows x64 headless Chromium/SwiftShader; physical mobile GPUs were not tested.
