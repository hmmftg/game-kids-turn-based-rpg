# محله‌ی مهربانی — game-kids-turn-based-rpg

A nonviolent, offline-first, Persian (RTL) turn-based RPG vertical slice for children aged 3–7,
built to the specification in [`.plans/1st.md`](.plans/1st.md).

> **Draft content.** Every educational and religious record in this repository is a clearly marked
> `draft` placeholder with empty quotation and citation fields. Nothing here is an authentic hadith
> or a verified religious quotation, and nothing may be shipped as educational material until named
> reviewers supply permissioned editions and approve them. See [Content governance](#content-governance).

No backend, accounts, analytics, ads, third-party runtime requests, remote fonts, combat,
microphone, geolocation or device identifiers. Progress lives only in the browser's IndexedDB.

<!-- framework-roadmap:begin -->
<!-- prettier-ignore-start -->

## Framework roadmap

**6/9 phases completed** · Next: **Phase 7 — Five playable games** · [Full roadmap and exit gates](docs/FRAMEWORK-ROADMAP.md)

```mermaid
flowchart LR
  P1["1. Reusable core"] --> P2["2. World/renderer"] --> P3["3. Narrative/quests"] --> P4["4. Gameplay modules"] --> P5["5. Animation/cinematics"] --> P6["6. Creator tools"] --> P7["7. Five playable games"] --> P8["8. Individual releases"] --> P9["9. Player evaluation"]
  classDef complete fill:#dcfce7,stroke:#15803d,color:#14532d
  classDef next fill:#fef3c7,stroke:#b45309,color:#78350f
  classDef planned fill:#e5e7eb,stroke:#6b7280,color:#1f2937
  class P1,P2,P3,P4,P5,P6 complete
  class P7,P8,P9 planned
```

| Phase | Status | Evidence |
| --- | --- | --- |
| 1. Reusable core | ✅ Complete | [PR #110](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/110) |
| 2. World/renderer | ✅ Complete | [PR #111](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/111) |
| 3. Narrative/quests | ✅ Complete | [PR #113](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/113) |
| 4. Gameplay modules | ✅ Complete | [PR #116](https://github.com/hmmftg/game-kids-turn-based-rpg/pull/116); [29 gameplay tests](packages/gameplay/test/) |
| 5. Animation/cinematics | ✅ Complete | [Phase 5 execution evidence](.plans/phase-5-model-animation-cinematics.md); [rendered previews](docs/previews/phase5/) |
| 6. Creator tools | ✅ Complete | [.plans/phase-6-creator-tools.md](.plans/phase-6-creator-tools.md); [consumer screenshots](docs/previews/creator/) |
| 7. Five playable games | ⏳ Planned | [Product and release roadmap](PRODUCT-RELEASE-ROADMAP.md) |
| 8. Individual releases | ⏳ Planned | [Product and release roadmap](PRODUCT-RELEASE-ROADMAP.md) |
| 9. Player evaluation | ⏳ Planned | [Product and release roadmap](PRODUCT-RELEASE-ROADMAP.md) |

_Generated from the canonical roadmap. Update status and evidence in [docs/FRAMEWORK-ROADMAP.md](docs/FRAMEWORK-ROADMAP.md), then run npm run roadmap:sync._

<!-- prettier-ignore-end -->
<!-- framework-roadmap:end -->

<!-- sample-games:begin -->
<!-- prettier-ignore-start -->

## Samples / Playable Games

These independent samples show how the reusable packages fit into different games. Screenshots below come from Chromium rendering each production build. Captures are documentation previews, not pixel-perfect regression baselines.

### محله مهربانی — Implemented and playable

The production reference game consumes public `waypoint-rpg-core`, `waypoint-rpg-narrative`, and `waypoint-rpg-gameplay` for runtime/navigation, replayable quest progression, and deterministic child micro-battles. Its physical interaction policy, rendering, and profile persistence remain app-owned.

[Game guide](README.md) · `npm ci && npm run dev`

| Capture | Actual browser rendering |
| --- | --- |
| Town hub | ![Actual محله مهربانی — Town hub](docs/previews/legacy-sample/04-town-hub.png) |
| Town hub · portrait | ![Actual محله مهربانی — Town hub · portrait](docs/previews/legacy-sample/05-town-portrait.png) |
| Persian NPC dialogue | ![Actual محله مهربانی — Persian NPC dialogue](docs/previews/legacy-sample/06-guardian-dialogue.png) |
| Encounter choice | ![Actual محله مهربانی — Encounter choice](docs/previews/legacy-sample/07-encounter-choice.png) |
| Completed physical interaction | ![Actual محله مهربانی — Completed physical interaction](docs/previews/legacy-sample/08-physical-interaction.png) |
| Sticker reward | ![Actual محله مهربانی — Sticker reward](docs/previews/legacy-sample/09-sticker-reward.png) |
| Completed quest replay | ![Actual محله مهربانی — Completed quest replay](docs/previews/legacy-sample/10-replayed-quest.png) |
| Real micro-battle | ![Actual محله مهربانی — Real micro-battle](docs/previews/legacy-sample/11-lightweight-battle.png) |
| Persistent world discovery | ![Actual محله مهربانی — Persistent world discovery](docs/previews/legacy-sample/12-world-discovery.png) |
| Restored profile progress | ![Actual محله مهربانی — Restored profile progress](docs/previews/legacy-sample/13-restored-profile.png) |

Other captures: [01-title](docs/previews/legacy-sample/01-title.png) · [02-avatar-select](docs/previews/legacy-sample/02-avatar-select.png) · [03-headwear-select](docs/previews/legacy-sample/03-headwear-select.png).

> **Draft content.** The existing game still contains educational and religious placeholders that require review; its screenshots do not imply content approval.

### برگ خون — Technical demonstration

An independent two-scene consumer demonstrating framework narrative, scene loading, transitions, persistence, and runtime-fact projection.

[Game guide](examples/scene-demo/README.md) · `npm run example:scene-build`

| Capture | Actual browser rendering |
| --- | --- |
| Village courtyard | ![Actual برگ خون — Village courtyard](docs/previews/blood-leaf/01-courtyard.png) |
| Persian story choice | ![Actual برگ خون — Persian story choice](docs/previews/blood-leaf/02-dialogue.png) |
| Narrative-driven lantern | ![Actual برگ خون — Narrative-driven lantern](docs/previews/blood-leaf/03-lit-lantern.png) |

### Phase 5 — Animation and Cinematics — Technical demonstration

The Blood Leaf scene demo also contains an example-owned static/rigged GLB adapter, independent character animation, and an optional timeline whose cues cannot change durable story state.

[Game guide](examples/scene-demo/README.md) · `npm run sample:phase5:previews`

| Capture | Actual browser rendering |
| --- | --- |
| Textured static GLB | ![Actual Phase 5 — Animation and Cinematics — Textured static GLB](docs/previews/phase5/01-static-model.png) |
| Independent rig instances | ![Actual Phase 5 — Animation and Cinematics — Independent rig instances](docs/previews/phase5/02-two-rigged-characters.png) |
| Guardian interaction | ![Actual Phase 5 — Animation and Cinematics — Guardian interaction](docs/previews/phase5/04-character-interaction.png) |
| RTL cinematic dialogue | ![Actual Phase 5 — Animation and Cinematics — RTL cinematic dialogue](docs/previews/phase5/06-cinematic-dialogue.png) |
| Reduced motion | ![Actual Phase 5 — Animation and Cinematics — Reduced motion](docs/previews/phase5/08-reduced-motion.png) |
| Portrait viewport | ![Actual Phase 5 — Animation and Cinematics — Portrait viewport](docs/previews/phase5/09-mobile-portrait.png) |

Other captures: [03-moving-character](docs/previews/phase5/03-moving-character.png) · [05-cinematic-camera](docs/previews/phase5/05-cinematic-camera.png) · [07-lantern-consequence](docs/previews/phase5/07-lantern-consequence.png).

### باغ قصه‌ها — Implemented and playable

A complete Persian 3D adventure using the installed public core, narrative, and gameplay packages. Two story paths include a real tactical encounter, visible garden changes, and persistent progress.

[Game guide](examples/garden-adventure/README.md) · `npm run sample:garden:dev`

| Capture | Actual browser rendering |
| --- | --- |
| Village | ![Actual باغ قصه‌ها — Village](docs/previews/garden-adventure/02-village.png) |
| Persian NPC dialogue | ![Actual باغ قصه‌ها — Persian NPC dialogue](docs/previews/garden-adventure/03-dialogue.png) |
| Inventory and equipment | ![Actual باغ قصه‌ها — Inventory and equipment](docs/previews/garden-adventure/04-inventory.png) |
| Garden before the objective | ![Actual باغ قصه‌ها — Garden before the objective](docs/previews/garden-adventure/05-garden-before.png) |
| Garden · gardener path | ![Actual باغ قصه‌ها — Garden · gardener path](docs/previews/garden-adventure/06-garden-restored.png) |
| 5×5 tactical battle | ![Actual باغ قصه‌ها — 5×5 tactical battle](docs/previews/garden-adventure/07-tactical-battle.png) |
| Ability and status effect | ![Actual باغ قصه‌ها — Ability and status effect](docs/previews/garden-adventure/08-ability-effect.png) |
| Garden · guardian path | ![Actual باغ قصه‌ها — Garden · guardian path](docs/previews/garden-adventure/09-guardian-outcome.png) |
| Story ending | ![Actual باغ قصه‌ها — Story ending](docs/previews/garden-adventure/10-ending.png) |
| Restored saved garden | ![Actual باغ قصه‌ها — Restored saved garden](docs/previews/garden-adventure/12-restored.png) |

Other captures: [01-title](docs/previews/garden-adventure/01-title.png) · [11-mobile](docs/previews/garden-adventure/11-mobile.png).

**Status key:** Implemented and playable means the sample can be completed; Technical demonstration means it focuses on framework integration. The Shahnameh proof of concept is **Planned**. Verification beyond Chromium with software WebGL and on physical devices is **Not yet verified**.

<!-- prettier-ignore-end -->
<!-- sample-games:end -->

## Library-backed reference game

The root production app, **محله مهربانی**, is a first-party consumer of the
public `waypoint-rpg-core`, `waypoint-rpg-narrative`, and
`waypoint-rpg-gameplay` package roots. It remains the same application at the
repository root and is also listed in the Samples gallery above. The
`framework:mahalle-consumer` gate builds a copied root app against three
independently packed and installed tarballs outside the checkout.

| Consumer     | Core                          | Narrative                                 | Gameplay                                               | Main integration boundary                                                               |
| ------------ | ----------------------------- | ----------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| محله مهربانی | Runtime and navigation        | Nine replayable quests and dialogue graph | Generic deterministic child micro-battles              | Physical quest choreography, profile saves, renderer, and product policy stay app-owned |
| برگ خون      | Runtime and scene integration | Authored story and world facts            | —                                                      | Independent 3D technical demonstration                                                  |
| باغ قصه‌ها   | Runtime and navigation        | Branching story and quests                | Progression, inventory, equipment, and tactical combat | Game-owned transaction coordinator and 3D host                                          |

See the [Mahalle adoption report](docs/MAHALLE-LIBRARY-ADOPTION.md) for the
compatibility adapter, persistence boundary, creator asset catalog, and actual
verification evidence. The root renderer, IndexedDB profile saves, physical
child interactions, and content policy remain game-owned.

Real source-rendered screenshots for the Kids RPG, the independent Blood Leaf
demonstration, and Garden of Stories are captured with Playwright on merges to
`main`, uploaded as Actions artifacts, and proposed with the gallery through
one reviewable documentation PR.

To capture them locally after installing Chromium, run
`npm run build && npm run sample:previews`. This capture suite is separate
from the regular E2E regression shards.

## Requirements

- Node.js 22.22.2 or newer in the Node 22 line, with npm 10.x (the repo is developed on Node 22.23.5 and npm 10.9.9)
- On Windows use `npm.cmd` for every command below

## Setup

```bash
npm ci
npm run dev          # http://localhost:5173
```

## Scripts

| Script                              | Purpose                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`                       | Vite dev server                                                           |
| `npm run dev:linked`                | Package watch build followed by Vite, for live core-library edits         |
| `npm run framework:watch:check`     | Chromium check for linked updates, failed-build preservation and recovery |
| `npm run build`                     | Content validation → strict `tsc -b` → production bundle → budget check   |
| `npm run preview`                   | Serve `dist/` on port 4173 (used by Playwright)                           |
| `npm run typecheck`                 | Strict TypeScript project build                                           |
| `npm run lint` / `lint:fix`         | ESLint (flat config, type-aware)                                          |
| `npm run format` / `format:check`   | Prettier                                                                  |
| `npm test`                          | Vitest unit + component tests (jsdom)                                     |
| `npm run test:e2e`                  | Playwright golden paths against the production preview                    |
| `npm run validate:content`          | Content/provenance validation (development mode: drafts warn)             |
| `npm run validate:content:release`  | Release gate: **fails** while any reachable record is not `approved`      |
| `npm run check:budgets`             | Gzip transfer budgets over `dist/`                                        |
| `npm run framework:build`           | Compile the dependency-free ESM core package                              |
| `npm run framework:consumer`        | Pack and verify an isolated tarball consumer                              |
| `npm run sample:garden:dev`         | Play the Persian Garden adventure locally                                 |
| `npm run sample:garden:e2e`         | Run the Garden production-browser gameplay suite                          |
| `npm run sample:garden:previews`    | Capture real Garden gameplay screenshots                                  |
| `npm run framework:garden-consumer` | Verify Garden against installed core and narrative tarballs               |
| `npm run verify`                    | format:check → lint → package boundary/build/tests → app gates            |

## Architecture

```
src/
  domain/      pure TypeScript: state machine, quests, encounters, save schema (no React, no Three)
    game/      modes, commands, reducer, checkpoints, selectors, versioned save + migration
    quests/    quest definitions, ordered prerequisites, encounter phase machine
  content/     typed Persian copy, icon semantics, provenance records, validation
  world/       React Three Fiber hub: canvas, cubic model provider, waypoint graph + A*
  ui/child/    DOM HUD: screens, dialogue cards, pictogram choices, quest trail, stickers, pause
  ui/parent/   press-and-hold gate, sources/credits/privacy/diagnostics/reset
  services/    persistence (IndexedDB + memory fake), audio, device capabilities, PWA lifecycle
  app/         React provider wiring domain ↔ services ↔ UI, error boundary
e2e/           Playwright golden paths
scripts/       content validation and build budget checks
packages/core/ dependency-free ESM package, public root at waypoint-rpg-core
```

Key rules the code enforces:

- **Domain purity.** `src/domain/` imports nothing from React, Three.js or the DOM. Every transition
  is a pure function of `(state, command, now)`, invalid transitions return the _same object_, and
  autosave only fires after a stable transition (`title`, `avatarSelect`, `hub`, `parentArea`).
- **Encounter machine.** `intro → demonstrate → playerChoice → worldResponse → reinforce → complete`.
  A wrong pick returns to `demonstrate`, increments a retry counter and never fails, shames or blocks.
- **Persistence.** Only schema version, avatar id, quest progress, checkpoint, stickers, audio
  settings, quality tier, the current map/anchor and discovered world facts, and a timestamp are stored. React/Three objects and device identifiers are
  never persisted. Corrupt saves fall back to a fresh state without deleting the bad payload; reset
  is only reachable from the parent area.
- **Rendering.** `frameloop="demand"` with explicit `invalidate()` during movement, a locked
  orthographic camera, one hemisphere + one directional light, blob shadows (no shadow maps),
  capped device pixel ratio per quality tier, visibility pause, and raycasting restricted to the
  ground plane and hotspot rings.
- **RTL UI in the DOM.** All text lives outside the canvas so Persian shaping, fonts and assistive
  technology behave correctly. Child controls are ≥64×64 CSS px.

### Replacing the cubic art with real models

`src/world/models/modelProvider.ts` defines the `ModelSet` boundary (`Figure`, `Landmark`, `Prop`).
`CUBIC_MODELS` is the current implementation; supplying a GLB-backed `ModelSet` through
`ModelContext` swaps the art without touching quest, navigation or state logic. Both avatars are
mechanically identical — only palettes differ — so new models must keep identical proportions.

Audio follows the same pattern: `src/services/audio/manifest.ts` lists assets with `url: null` and
`licence: 'placeholder-silence'`. The game is fully playable silent; replacing a placeholder means
adding a locally bundled file plus written licence and attribution in the manifest entry.

## Content governance

- Every quest, dialogue node and source record carries `review: { status, reviewer, reviewedAt }`,
  and all of them are currently `draft` with blank reviewer fields.
- Source cards keep `arabicQuotation`, `persianTranslation` and every citation field empty, and all
  reproduction-rights flags are `false`. No religious text is reproduced anywhere in this repository.
- Child-facing copy is a plain Persian behaviour summary only. `src/content/validation.ts` rejects
  shame, fear, violence, punishment and quantified spiritual merit vocabulary.
- `npm run validate:content` (run automatically by `build`) reports drafts as warnings so the slice
  stays developable. `npm run validate:content:release` is the release gate and **fails** while any
  production-reachable record is not `approved` — wire it into any publishing pipeline.
- Promotion path: a named reviewer supplies a permissioned edition → fill quotation, translation,
  full citation and rights → set `status: 'approved'` with reviewer name and date → release
  validation passes.

## Testing matrix

| Layer        | Tool                     | Covers                                                                                         |
| ------------ | ------------------------ | ---------------------------------------------------------------------------------------------- |
| Domain       | Vitest                   | every transition, invalid transitions, prerequisites, checkpoints, idempotence                 |
| Save         | Vitest                   | schema validation, v1→v2 migration, clamping, corrupt and future-version saves                 |
| Persistence  | Vitest + fake-indexeddb  | repository contract, memory fake, corrupt payload reporting                                    |
| Navigation   | Vitest                   | waypoint graph, A*, nearest-anchor resolution, non-walkable rejection                          |
| Content      | Vitest                   | draft invariants, empty citations, forbidden vocabulary, release gate                          |
| Components   | Vitest + Testing Library | title → avatar → hub, gentle retry, parent gate                                                |
| Golden paths | Playwright               | first run, both avatars, three quests + finale, refresh/resume, offline replay, WebGL fallback |

```bash
npm test
npx playwright install --with-deps chromium   # once
npm run test:e2e
```

## PWA, offline and deployment

`vite-plugin-pwa` (Workbox `generateSW`, `registerType: 'prompt'`) revisioned-precaches the shell and
slice assets; `public/manifest.webmanifest` requests `standalone` + `landscape` with local icons.
Updates are never applied mid-play: the waiting worker is only activated from the pause menu.
`public/offline.html` covers a first visit that never finished caching.

Deploy `dist/` to any static host over HTTPS (service workers require it):

```bash
npm run verify
npm run validate:content:release   # must pass before shipping as educational material
# upload dist/
```

Host requirements: serve `index.html` for unknown routes, do not rewrite `sw.js` caching headers to
something long-lived, and keep the app on its own origin path. The build is same-origin only; the
CSP in `index.html` forbids any third-party connection.

Current production transfer (gzip): ~376 KB total, well inside the <10 MB budget enforced by
`scripts/check-budgets.ts`.

## Licence

Code: MIT (see `LICENSE`). Font: Vazirmatn under the SIL Open Font License, bundled as a local
subset. No other third-party runtime asset is included.
