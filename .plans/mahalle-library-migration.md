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
