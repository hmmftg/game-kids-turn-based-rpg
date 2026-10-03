# Architecture References

External RPG architectures studied against this codebase, and the specific ideas worth
borrowing, adapting, or rejecting. This is a study document — our architecture
(`docs/ARCHITECTURE.md`, `docs/INTERACTION-MODEL.md`, `docs/ANIMATIONS.md`) remains
authoritative. No production code changed as a result of this audit.

Audit date: 2026-10-03.

## Audited references (pinned)

Every finding below is evidence from the inspected commit, not the project's README or
marketing description.

| Reference        | Repository                                      | Commit                                     | Audited    | Relevant paths                                                                                                                                                                                                                                          |
| ---------------- | ----------------------------------------------- | ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overworld Engine | <https://github.com/luzhenqian/overworld>       | `2fa9266542de81ef44bd6b858b6f8a825c1dc591` | 2026-10-03 | `packages/core/src/{registry,persist,events}.ts`, `packages/quest/src/{engine,types}.ts`, `packages/dialogue/src/{engine,types}.ts`, `packages/scene/src/sceneJson.tsx`, `packages/content/src/{types,validateContentPack,applyContentPack,tracker}.ts` |
| RPGJS v5         | <https://github.com/RSamaium/RPG-JS>            | `2560a72fa9ca8b33ef9b61e69003e58872e4f344` | 2026-10-03 | `packages/common/src/{modules,rooms/Map,services/save}.ts`, `packages/server/src/decorators/event.ts`, `packages/server/src/rooms/*`, `packages/studio/runtime/schemas/*`, `playground/games/v4-compat/main/events/villager.ts`                         |
| RPGAtlas         | <https://github.com/DriftwoodGaming/RPGAtlas>   | `632d0b9d5856f42d31de5db383daa5ca2e4c3274` | 2026-10-03 | `src/engine/interpreter/{interp,registry}.ts`, `src/engine/interpreter/commands/*`, `src/engine/state/*`, `src/engine/scenes/map-runtime.ts`, `src/editor/event-editor/*`                                                                               |
| RPG Crafter      | <https://github.com/paulantoine2/rpgcrafter>    | `0bb87da7a80ad284bffad77376b823bf2584f95a` | 2026-10-03 | `packages/game-schema/src/{schema,types,migration}.ts`, `apps/player/src/{event-runtime,content-loader}.ts`, `apps/studio/src/`, `content/reference-game/{manifest,quests,events,initial-state}.json`                                                   |
| React RPG        | <https://github.com/ASteinheiser/react-rpg.com> | `86604e9f67abc88fb3f2bbffe67e0837224167ea` | 2026-10-03 | `src/features/{player,monsters,world,inventory,stats}/actions/*`, `src/features/*/reducer.jsx`, `src/features/monsters/actions/take-monsters-turn.jsx`, `src/utils/dice.js`                                                                             |

---

## Per-reference findings

For each project: what its architecture solves, where that responsibility lives, the
smallest borrowable idea, where it would fit here, what conflicts, whether it adds or
removes complexity, and whether it is useful now, later, or never.

### 1. Overworld Engine — R3F renderer/systems architecture

**Problem it solves.** Shipping a 3D RPG systems framework (quest, dialogue, inventory,
save, scene) as small independent npm packages that a game assembles, instead of a
monolith. Every system is a framework-agnostic vanilla store that React consumes
read-only.

**Where the responsibility lives.**

- `packages/core/src/registry.ts` — `EffectRef`/`ConditionRef` (`{type, params}`)
  resolved at runtime through `EffectRegistry`/`ConditionRegistry`. Content references
  behavior by string id; game code registers handlers at startup. Engine packages never
  import game code.
- `packages/quest/src/engine.ts` — zustand vanilla store (`createStore` from
  `zustand/vanilla`) holding `definitions` (content, not persisted), `active`,
  `completed` (persisted). `QuestEngineConfig` injects `conditions`, `effects`,
  `events`, `persist`, and a `clock` (`() => number`, injectable "when replayed
  sessions must produce byte-identical state").
- `packages/quest/src/types.ts` — `ObjectiveTrigger {event, filter, amountFrom}`:
  objectives auto-progress by subscribing to a typed event bus; no imperative
  progress hooks in other systems.
- `packages/core/src/persist.ts` — `persistOptions({name, version, storage,
partialize, migrate})`: namespaced key (`overworld:<name>`), explicit version +
  migrate, swappable `StateStorage` (`createMemoryStorage()` for tests/SSR).
- `packages/scene/src/sceneJson.tsx` — `SceneJson` is _structurally identical_ to the
  editor's `EditorSceneJSON` but declared locally: "the scene and editor packages
  never import each other — the editor's exported JSON plugs into this package purely
  via structural typing." Pure mappers `sceneJsonToShellProps`/`sceneConfigToSceneJson`
  round-trip losslessly.
- `packages/content/src/types.ts` — `ContentPack {id, version, dialogues?, quests?,
items?, achievements?}` applied through `ContentPackTargets`, a _structural subset_
  of the live engines (`{registerQuests(...)}`), validated by `validateContentPack`
  before `applyContentPack` mutates anything; `ContentPackTracker` warns on
  out-of-order versions.

**Smallest borrowable idea.** The `ObjectiveTrigger` pattern: progress declared as a
data row (`{event, filter}`) evaluated by the engine, instead of each quest step
hard-coding which call site reports progress.

**Where it would fit.** `src/domain/quests/` — quest steps could declare their advance
condition as data instead of being a fixed `EncounterStep` sequence.

**Conflicts.** Our quests are deliberately _scripted encounters_, not open-world
objective counters: `encounter.ts` is a fixed phase machine `intro → demonstrate →
playerChoice → worldResponse → reinforce → complete` where the child's physical choice
is the only progress event. A bus-trigger model adds an indirection layer (subscribe,
count, resubscribe after rehydration — `resubscribe()` exists precisely because this
is fiddly) for a product that never needs it. The `EffectRef`/`ConditionRef` registry
is the same story: useful when content authors outnumber coders, premature for ~10
authored steps.

**Complexity.** Adds (new subscription lifecycle, rehydration re-attach, bus contract).

**Verdict.** Study only for the trigger/registry mechanics. One real import is already
ours in spirit: `persistOptions` `partialize` + version + swappable storage mirrors
`src/services/persistence/repository.ts`; `clock` injection confirms our determinism
rule. The `SceneJson` structural-typing trick is worth remembering if an authoring
tool ever exists (see RPGAtlas/RPG Crafter rows).

### 2. RPGJS v5 — mature RPG domain architecture

**Problem it solves.** Running the _same_ game logic authoritatively on a server and
predictively on a client in a networked RPG, with a plugin/module ecosystem that can
extend both sides without forking the engine.

**Where the responsibility lives.**

- `packages/server/src/decorators/event.ts` — events are classes carrying metadata
  via decorators: `@EventData({name, hitbox, mode, pushable, mass})`. `EventMode`
  splits `shared` (one world event) vs `scenario` (per-player instance — "the event is
  duplicated by each player").
- `playground/games/v4-compat/main/events/villager.ts` — gameplay expressed as
  lifecycle hooks on the class: `onInit() { this.setGraphic('female') }`,
  `async onAction(player) { await player.showText(...); player.gold += 10 }`.
- `packages/common/src/modules.ts` — `RpgModule(options)` decorator copies option
  keys onto the class prototype; `Hooks` indexes every module's hook functions by
  `${namespace}-${type}-${hook}` into rxjs `Subject`s; `Side.Client`/`Side.Server`
  tuple types declare which side a module runs on.
- `packages/common/src/rooms/Map.ts` — the map is a room object using `@signe/reactive`
  signals (`signal`, `effect`) wrapping physics entities (`@rpgjs/physic`), a
  `MovementManager`, `WorldMapsManager`, and hitbox query APIs
  (`findSpawnPosition`, `queryArea`) shared by both sides.
- `packages/common/src/services/save.ts` — save slots are thin `SaveSlot {snapshot,
...meta}` wrappers around serialized snapshots.
- `packages/studio/runtime/schemas/*` + `runtime/blocks/executors/*` — the Studio
  editor describes each event command as a JSON schema and executes authored blocks
  through per-type executors (`common-event.ts`, `erase-event.ts`, …).

**Smallest borrowable idea.** Named lifecycle hooks on an entity definition
(`onInit`, `onAction`, per-trigger execution) — a data-driven entity gets _named
moments_ instead of a single imperative blob.

**Where it would fit.** `src/world/registry.ts` NPC definitions could grow named hook
points if NPC behavior ever goes beyond `NpcSchedule` movement + contextual dialogue.

**Conflicts.** RPGJS's core bet — server/client symmetry, `@signe/sync` state
replication, DI module container, rxjs hook streams — solves problems an offline PWA
does not have. `EventMode.Scenario` ("the event is duplicated by each player") is
meaningless here. The decorator-metadata layer hides behavior behind reflection-ish
registration, which fights our "domain is plain functions, invalid commands return the
same object" style. Its event model also _adds_ mandatory interaction steps
(`onAction` → `showText` → player must dismiss), which our interaction budget
validator forbids.

**Complexity.** Adds (server/client split, DI container, signal graph, decorator
runtime).

**Verdict.** Study only. Take the _idea_ that NPC entities deserve named lifecycle
moments (`NpcSchedule` already does this for movement: authored `spots` +
`resolveNpcAnchor`, event-driven, no per-frame work); do not take the machinery.

### 3. RPGAtlas — engine/editor/content separation

**Problem it solves.** One engine runs both the shipped game and content authored in
the in-repo editor, by making _all_ gameplay behavior a list of data commands that a
single interpreter walks.

**Where the responsibility lives.**

- `src/engine/interpreter/registry.ts` — `registerCommand(type, handler)`; built-in
  commands and plugin commands ("the plugin bridge routes onto the SAME registry")
  dispatch through one `Map<string, CommandHandler>`. `Interp.exec` reduces to
  "look up handler, call it; unknown types are a silent no-op."
- `src/engine/interpreter/interp.ts` — `Interp` walks command lists with an
  `InterpContext {interp, state, services}`. The `services` surface (message, quests,
  scene transitions, camera, waits) is injected via `initInterpServices()`, so
  handlers never import the engine. `origin` tracks who the run acts as; `runEpoch`
  invalidates stale runs ("going back to the title bumps the epoch, and every list
  this run is inside unwinds at its next command").
- `src/engine/interpreter/commands/{actors,combat,flow,presentation,state,system,
world}.ts` — built-in handlers grouped by domain.
- `src/editor/event-editor/{command-defs,command-list,event-editor,graph-editor}.ts` —
  the editor edits the _same_ command lists the interpreter executes; editor and
  runtime share the command vocabulary, not each other's code.
- `src/engine/state/game-state.ts` — `G` is the single mutable world state handlers
  receive through the context.

**Smallest borrowable idea.** One dispatch table where _content commands_ and
_built-ins_ are indistinguishable — gameplay expressed as a data list interpreted by a
small engine, so adding behavior never forks the run loop.

**Where it would fit.** Our `EncounterStep[]` + `advancePhase`/`applyChoice` already is
a (much smaller) command-list interpreter: content declares steps, the reducer walks
them, `contextForStep()` maps state → presentation targets. The fit would be
generalizing `EncounterStep` into a command union if quests ever need richer beats
than choice/demonstrate.

**Conflicts.** RPGAtlas's interpreter is async, services-mutating, and permissive
(unknown command = silent no-op; `any`-heavy payloads "typed loosely this phase"). Our
domain contract is the opposite: pure `(state, command) → state`, invalid commands
return the _same object_, and an unknown step id fails `validate:content`, not a
no-op. Its RPG-Maker-style trigger set (autorun/parallel/playerTouch) would let
content force sequences the interaction budget forbids.

**Complexity.** Neutral as a pattern (we already do a tiny version of it); the full
interpreter would add complexity we don't need.

**Verdict.** Adapt later _as a precedent_: if quest content outgrows `EncounterStep`,
evolve it toward a typed command union interpreted by the existing reducer — not
toward a service-injecting interpreter. The `runEpoch` idea already exists here as the
`seenCheckpointAtRef` watermark.

### 4. RPG Crafter — portable content/schema architecture

**Problem it solves.** A game is a _portable package_: JSON documents validated against
shared schemas, migrated forward across engine versions, and consumed by a player
runtime and an editor (Studio) that never share implementation, only the schema
package.

**Where the responsibility lives.**

- `packages/game-schema/src/schema.ts` — ~670 lines of Zod schemas (`strict()`
  objects, discriminated unions like `TerrainCollisionSchema`,
  `discriminatedUnion('kind', …)`) defining every document type; `ENGINE_VERSION =
'0.16.0'` declared once.
- `content/reference-game/manifest.json` — `{schemaVersion, engineRange, gameId,
version, entryPoint: {mapId, spawnId}}`: the package declares which engine range it
  runs on.
- `packages/game-schema/src/migration.ts` — ~780 lines of pure forward-migration
  functions (`migrateCommands`, `migrateEventVisuals`, …) applied by
  `migrateSourceGameFiles` before validation; old documents are upgraded, never
  rejected for age.
- `content/reference-game/{actors,enemies,events,items,maps,quests,skills,ui,
initial-state}.json` — cross-document references by id; `quests.json` models a quest
  as `{"name", "states": [...], "reward"}` — a flat state-name list, not imperative
  code.
- `apps/player/src/event-runtime.ts` — `MapEventRuntime` is a _page-aware scheduler_:
  per-map `EventState {pageIndex, inside}` map, trigger types `playerTouch /
eventTouch / autorun / parallel / actionButton` with radius checks; `sync()`
  resets `inside` flags on page change.
- `apps/studio/` (React editor) and `apps/player/` (PixiJS runtime) depend on
  `game-schema`, never on each other — the schema package is the only contract.

**Smallest borrowable idea.** `manifest` + `schemaVersion` + forward-migration: a
content package that knows which engine it targets and can be upgraded mechanically.

**Where it would fit.** `src/content/` — if content ever becomes an exported package
(e.g. a second game, reviewer tooling), our `PersistedState` already shows the shape:
additive tolerant fields, versioned, corrupt → fresh rather than crash.

**Conflicts.** Converting `src/content/fa/*.ts` to JSON today buys nothing: content is
TypeScript _data_ already (`QUEST_DEFINITIONS` is a literal array; copy lives in
`content/fa` behind `validate:content`), and JSON would lose the type-check the
compiler gives us for free. The Zod dependency is unneeded — `validation.ts` already
returns a structured report (`validateContent → {ok, issues…}` consumed by
`scripts/validate-content.ts` and `validation.test.ts`). Event triggers like
`autorun`/`parallel` violate the child model: nothing may start without the child
acting or watching a bounded auto-play.

**Complexity.** Porting to JSON + schemas + migrations adds a whole toolchain for a
solo-authored game — net add now, maybe net remove _if_ an editor ever exists.

**Verdict.** Adapt later, and only the narrow slice: an `engineRange`/schema-version
convention on content + a forward-migration module — _if and when_ content becomes a
distributable package. Studio/Player separation is the model to copy at that point.
The `MapEventRuntime` trigger taxonomy is a good catalogue of what our model
deliberately excludes.

### 5. React RPG — turn-based state/action architecture

**Problem it solves.** A classic HP/monster/loot dungeon-crawl where every turn is an
explicit action dispatched through Redux, and each monster's behavior is a named AI
strategy picked from a data field.

**Where the responsibility lives.**

- `src/features/*/reducer.jsx` — per-feature Redux slices (`world`, `player`,
  `monsters`, `inventory`, `stats`, `journal`, `snackbar`, `dialog-manager`, …).
- `src/features/monsters/actions/take-monsters-turn.jsx` — `takeMonstersTurn()` is a
  thunk that iterates `components[currentMap]` and dispatches a _per-AI action
  creator_ selected by `monster.ai`: `suicidal | ranged | boss/normal | frozen |
poisoned | frightened | shocked | scared | magical | healer | ranged | frightened`.
  Dead monsters are re-fetched (`if (monster === undefined) return`) because a sibling
  may have died mid-pass.
- `src/features/player/actions/attack-monster.jsx` — `findTarget(position, direction,
range)` is a thunk that walks tiles directionally via `getNewPosition` until
  `observeImpassable` or `checkForMonster` — targeting computed inside the action with
  `getState()`.
- `src/utils/dice.js` + `calculate-modifier` — deterministic roll helpers pure enough
  to unit test in isolation (`src/__tests__/utils/*`).
- `src/features/monsters/actions/{normal-ai,frightened-ai,magical-ai,…}.jsx` — one
  file per AI strategy.

**Smallest borrowable idea.** One-file-per-strategy AI keyed on a data field
(`monster.ai`), dispatched by a single turn driver.

**Where it would fit.** `src/world/critters.ts` / `NpcSchedule` is already this shape:
behavior selected from data (`archetype`, `spots`), driven by one controller. A
richer NPC repertoire later would grow the same way — named strategies, not flags.

**Conflicts.** Thunks reaching into `getState()` mid-dispatch (`checkForMonster`,
`observeImpassable`) is exactly what our domain purity forbids — in `encounter.ts`
the reducer sees the whole transition and rejects invalid commands by returning the
same object, which is stronger than RPG's "mutate then reconcile" (`monster ===
undefined` guard exists precisely because sibling dispatch already mutated). Their
per-feature slices also scatter state across reducers; our single `GameState` avoids
cross-slice `getState()` reads entirely. React RPG's model is fine for a grown-up
dungeon crawler; it would move decisions _out_ of our reducer and _into_ action
creators.

**Complexity.** Neutral to adopt in spirit (we already do); adopting the thunk style
would add hidden state reads and ordering bugs.

**Verdict.** Study only — its value here is confirming our choice: the strategy-dispatch
pattern, kept inside pure domain functions instead of thunks.

---

## Comparison matrix

| Concern                    | Our current architecture                                                                                 | Overworld                                                                  | RPGJS                                                  | RPGAtlas                                             | RPG Crafter                                                 | React RPG                        | Recommendation                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer                   | R3F `<Canvas>`, `frameloop="demand"`, orthographic rig, ModelSet boundary                                | R3F `SceneShell` + `SceneJson` structural doc                              | signal-wrapped canvas renderers per side               | Three.js HD-2D `src/renderer` + engine `render-glue` | PixiJS in `apps/player`                                     | DOM tiles + sprites              | **Study only** — our demand-loop R3F matches Overworld's model already; no swap                                                        |
| World model                | `WorldArea`/`WorldMapDefinition` + anchors + authored nav edges, data-only growth                        | `SceneJson {npcs, buildings, decorations}` doc → shell props               | Room objects w/ physics + hitbox queries               | tile maps + zones, map-runtime scene                 | `maps.json` doc + tileset schemas                           | `maps/` data + generated tiles   | **Adapt later** — data-driven maps already ours; scene-doc export only if an editor appears                                            |
| Quest model                | `QuestDefinition` + fixed `EncounterStep[]` phase machine                                                | `QuestDefinition` objectives + `ObjectiveTrigger` bus auto-progress        | module/gameplay hooks per game                         | quests via interpreter commands + `Quests` state     | `quests.json` flat `states[]` + reward                      | none (journal only)              | **Study only** — trigger-driven objectives unnecessary for scripted encounters                                                         |
| Dialogue                   | `DialogueNode` graph in `content/fa`, `OPEN_DIALOGUE` retargets, branches = data                         | `DialogueTree` nodes w/ `responses[].conditions/effects` (refs)            | `player.showText` imperative calls inside `onAction`   | interpreter `hub`/message commands                   | `events.json` dialogue commands                             | `dialog-manager` slice           | **Adapt later** — conditional `ConditionRef`-style responses, only if dialogue needs per-state branching beyond `dialogueIds`-per-spot |
| NPC behavior               | `NpcSchedule.spots` → `resolveNpcAnchor` (event-driven, deterministic); figure tap = dialogue            | `AgentNPC` + `ai` package                                                  | `RpgEvent` classes, lifecycle hooks, pushable hitboxes | event pages w/ autonomous movement routes            | `event-runtime` trigger scheduler                           | per-`monster.ai` strategy thunks | **Adapt concept** — named lifecycle/strategy points if NPC repertoire grows; ours already deterministic                                |
| Event system               | child tap → `CHOOSE` → phase machine; no ambient autorun                                                 | typed `gameEvents` bus + `EffectRef` registry                              | `@EventData` classes + room events                     | command-list interpreter + shared registry           | trigger types (`playerTouch/autorun/parallel/actionButton`) | Redux actions/thunks             | **Reject** the autorun/trigger model (interaction budget); **study** the one-registry dispatch shape                                   |
| Turn/action state          | pure reducer: `applyChoice`/`advancePhase`, invalid → same object                                        | zustand vanilla engines                                                    | server-authoritative rooms + signals                   | mutable `G` + injected services                      | `state-commands.ts` + runtime                               | Redux thunk turn drivers         | **Study only** — our pure reducer is the stronger model; thunk style would regress it                                                  |
| Save/persistence           | versioned `PersistedState`, tolerant additive fields, corrupt→fresh, checkpoint watermark                | `persistOptions` (namespace+version+migrate+partialize, swappable storage) | `SaveSlot {snapshot, meta}` wrappers                   | `state/save.ts` engine snapshots                     | `initial-state.json` + schemaVersion + migration chain      | `localStorage` snapshots         | **Adapt later** — schemaVersion/migration-chain convention if content becomes a package                                                |
| Content schema             | `content/fa/*.ts` typed data + `validate:content` (forbidden terms, quotes, refs, interaction budget)    | `ContentPack {id, version}` validated before apply                         | Studio JSON schemas per command                        | editor `command-defs.ts`                             | Zod `game-schema` package shared by editor+player           | `data/` JS modules               | **Adapt later** — keep TS; adopt portable-package conventions only if a second game or editor lands                                    |
| Validation                 | build-gated `validateContent` report (`ok`, issues, warnings) + `registry.test.ts` referential integrity | `validateContentPack` → `ValidationReport` before apply                    | studio `event-execution-guard`                         | —                                                    | `ContentIssue` list from schema parse                       | —                                | **Adopt concept** — already parallel; keep "validate before runtime, issues as data" as the stated invariant                           |
| Testing                    | vitest unit (`domain`, `registry`, `persistence`), playwright e2e, measure-world ceilings                | per-package vitest                                                         | vitest + `packages/testing`                            | `tests-unit`, `tests-e2e` + snapshots                | workspace vitest incl. migration tests                      | `__tests__/utils` unit only      | **Adopt concept** — rpgcrafter's _migration tests_ are the gap to copy if persistence versions multiply                                |
| Editor/authoring           | none — content authored as TS data + validator                                                           | `packages/editor` ↔ `scene` via structural `SceneJson`                     | `packages/studio` block runtime                        | in-repo editor sharing command vocabulary            | `apps/studio` ↔ `game-schema` only                          | none                             | **Defer** — all four converge on "editor talks to a schema/doc, never to runtime code"; right boundary to copy _when_ needed           |
| Renderer/domain separation | `domain/` pure TS, no React/Three/DOM imports (enforced rule)                                            | engines are vanilla stores; React reads state only                         | `common` shared by both sides                          | `shared/` vs `engine/` vs `editor/`                  | `game-schema` is the whole contract                         | features mix reducers+components | **Adopt concept** — ours already matches the best version (Overworld's); keep the import ban as the invariant                          |

---

## Per-reference validation pass

For each reference: concrete patterns worth remembering, the closest equivalent in
this repo, whether our boundary already satisfies the same invariant, the real gap
(if any), the smallest change that closes it, and the classification.

### Overworld

| #   | Pattern (evidence)                                                                                                               | Our closest equivalent                                                                                                    | Invariant satisfied?                                                                  | Gap → smallest change                                                                                              | Verdict                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1   | `EffectRef`/`ConditionRef` — content references behavior by string id, resolved via registries (`packages/core/src/registry.ts`) | `QuestDefinition` id refs (`landmarkId`, `dialogueIds`, `nextQuestIds`) resolved by `getQuestDefinition`/`contextForStep` | Yes — same "data references id, runtime resolves" seam, ours resolved at module level | No gap                                                                                                             | **Adopt concept** (name the seam; see ARCHITECTURE.md invariant) |
| 2   | `ObjectiveTrigger {event, filter}` — objectives progress by subscribing to a typed event bus (`packages/quest/src/types.ts`)     | `EncounterStep[]` scripted sequence + `CHOOSE`/`ADVANCE` commands                                                         | Not needed — our quests are scripted encounters, not event counters                   | None — adding a bus would be a second resolution layer                                                             | **Study only**                                                   |
| 3   | `persistOptions` — namespaced key, `version`, `partialize`, swappable `StateStorage` (`packages/core/src/persist.ts`)            | `src/services/persistence/repository.ts` versioned `PersistedState`, memory repository for tests                          | Yes — equivalent contract                                                             | No gap                                                                                                             | **Adopt concept** (already parallel)                             |
| 4   | `SceneJson` structurally identical to editor JSON, zero shared imports (`packages/scene/src/sceneJson.tsx`)                      | none — no editor exists                                                                                                   | n/a                                                                                   | If an editor ever exists: author against a serialized `QuestDefinition`/`WorldMapDefinition` doc, not runtime code | **Adapt later**                                                  |
| 5   | `QuestEngineConfig.clock` injection "when replayed sessions must produce byte-identical state" (`packages/quest/src/engine.ts`)  | deterministic reducer + world-clock tick                                                                                  | Yes                                                                                   | No gap                                                                                                             | **Adopt concept**                                                |

### RPGJS

| #   | Pattern (evidence)                                                                                       | Our closest equivalent                                                 | Invariant satisfied?                           | Gap → smallest change                                                   | Verdict               |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- | --------------------- |
| 1   | `@EventData({name, hitbox, mode})` metadata on event classes (`packages/server/src/decorators/event.ts`) | `NpcDefinition`/`WorldMapDefinition` metadata rows in registries       | Yes — ours is plainer data, same role          | No gap                                                                  | **Adopt concept**     |
| 2   | Named lifecycle hooks on entities (`onInit`/`onAction`, `playground/.../villager.ts`)                    | `NpcSchedule.spots` + `resolveNpcAnchor`; figure-tap → `OPEN_DIALOGUE` | Yes for current repertoire                     | If NPCs gain richer behavior: named deterministic strategies, not hooks | **Adapt later**       |
| 3   | `RpgModule`/`Hooks` module-DI system (`packages/common/src/modules.ts`)                                  | none                                                                   | n/a — solves multi-package plugin distribution | None; DI container is wrong for this codebase                           | **Explicitly reject** |
| 4   | `Side.Client`/`Side.Server` + authoritative rooms + `@signe/sync` (`packages/common/src/rooms/Map.ts`)   | none — offline single-player                                           | n/a                                            | None                                                                    | **Explicitly reject** |
| 5   | Studio `runtime/schemas/*` + per-block executors                                                         | `validate:content` + typed `EncounterStep`                             | Yes — validation-before-runtime exists         | No gap                                                                  | **Study only**        |

### RPGAtlas

| #   | Pattern (evidence)                                                                                                   | Our closest equivalent                                    | Invariant satisfied?                                 | Gap → smallest change                                                        | Verdict                                 |
| --- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------- |
| 1   | Single command registry shared by built-ins and plugins; `exec` = lookup+call (`src/engine/interpreter/registry.ts`) | `advancePhase`/`applyChoice` switch in `encounter.ts`     | Yes — ours is the same idea at fixed vocabulary size | If steps outgrow the union: extend the `EncounterStep` type union, keep pure | **Adapt later**                         |
| 2   | `runEpoch` invalidates stale interpreter runs on scene change (`src/engine/interpreter/interp.ts`)                   | `seenCheckpointAtRef` watermark; canvas remount lifecycle | Yes — equivalent staleness guard                     | No gap                                                                       | **Adopt concept**                       |
| 3   | Editor edits the same command lists the runtime executes (`src/editor/event-editor/command-defs.ts`)                 | none — no editor                                          | n/a                                                  | Same future-authoring boundary as Overworld `SceneJson`                      | **Defer**                               |
| 4   | Injected `services` surface so handlers never import the engine (`initInterpServices`)                               | domain functions receive state explicitly                 | Yes — ours is purer (no service indirection)         | No gap                                                                       | **Study only**                          |
| 5   | Unknown command = silent no-op                                                                                       | `validate:content`/`tsc` fails loudly on unknown refs     | Ours is stricter — better default                    | No gap; keep loud failure                                                    | **Explicitly reject** (silent dispatch) |

### RPG Crafter

| #   | Pattern (evidence)                                                                                                   | Our closest equivalent                                                   | Invariant satisfied?                                                     | Gap → smallest change                                                                                 | Verdict                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | `manifest.json` `{schemaVersion, engineRange, entryPoint}` (`content/reference-game/manifest.json`)                  | `PersistedState` version field                                           | Partially — saves versioned, content not (single product)                | Only if content becomes a package: add manifest + `engineRange`                                       | **Adapt later**                                            |
| 2   | Forward-migration chain upgrading old documents (`packages/game-schema/src/migration.ts`)                            | tolerant additive `PersistedState` fields; corrupt→fresh                 | Yes for saves; content has no migrations (never shipped stale shape)     | If persisted shape changes: write migration + migration test (rpgcrafter `migration.test.ts` pattern) | **Adapt later**                                            |
| 3   | Zod strict schemas shared by Studio + Player (`packages/game-schema/src/schema.ts`)                                  | TypeScript types + `validate:content`                                    | Yes — our TS data pipeline gives the same guarantee without a dependency | No gap                                                                                                | **Explicitly reject** (JSON-ification now; Zod dependency) |
| 4   | `MapEventRuntime` trigger taxonomy (`playerTouch/autorun/parallel/actionButton`, `apps/player/src/event-runtime.ts`) | deliberate exclusion: only deliberate tap + bounded auto-play            | Yes — and our exclusion is the product rule                              | No gap; triggers would violate interaction budget                                                     | **Explicitly reject** (autorun/parallel triggers)          |
| 5   | Cross-document id references (`quests.json`, `events.json`, `maps.json`)                                             | `dialogueIds`/`npcIds`/`anchorId` id refs + `registry.test.ts` integrity | Yes                                                                      | No gap                                                                                                | **Adopt concept**                                          |

### React RPG

| #   | Pattern (evidence)                                                                              | Our closest equivalent                                        | Invariant satisfied?                                     | Gap → smallest change                                                   | Verdict                                            |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | Per-AI strategy files dispatched on `monster.ai` (`actions/take-monsters-turn.jsx`, `*-ai.jsx`) | `useCritters` per-archetype behavior; `NpcSchedule`           | Yes — data → strategy resolver → pure/scheduled behavior | If NPC repertoire grows: named strategy modules in domain-adjacent code | **Adapt concept**                                  |
| 2   | Explicit action creators per turn step                                                          | `CHOOSE`/`ADVANCE`/`OPEN_DIALOGUE` commands                   | Yes                                                      | No gap                                                                  | **Adopt concept**                                  |
| 3   | Thunks reading `getState()` mid-dispatch (`findTarget`, sibling-death guard)                    | forbidden — pure reducer, invalid command returns same object | Ours is strictly stronger                                | No gap; thunk style would regress determinism                           | **Explicitly reject**                              |
| 4   | Pure dice/calculation utils unit-tested (`utils/dice.js`, `__tests__/utils`)                    | pure domain functions + vitest                                | Yes                                                      | No gap                                                                  | **Adopt concept**                                  |
| 5   | Per-feature Redux slices                                                                        | single `GameState` reducer                                    | Ours avoids cross-slice `getState()` reads               | No gap                                                                  | **Explicitly reject** (Redux/Zustand introduction) |

## Invariants confirmed

Verified by source inspection on 2026-10-03 (branch `devin/1791024154-architecture-references`):

| Invariant                                                                                                                        | Check performed                                                                                                                                           | Result  |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| content does not execute gameplay                                                                                                | `src/content/fa/*.ts` imports are `import type` only — copy/icon data records                                                                             | ✔ holds |
| presentation does not own gameplay state                                                                                         | `useState` in `src/ui/child/` is ephemeral presentation only (pressed state, avatar picker); `EncounterState` is consumed read-only from `src/app` wiring | ✔ holds |
| domain does not import presentation                                                                                              | `grep` of `src/domain` for react/three/DOM/`window`/`document` imports → zero                                                                             | ✔ holds |
| renderer does not define quest rules                                                                                             | `src/world/` references quests only for mounting/hotspot/validation lookups (`maps.test.ts`, `registry.test.ts`); no phase/choice logic                   | ✔ holds |
| animation does not define game state                                                                                             | animation episodes emit into `__worldAnimationEvents` (probe) and derive from committed state transitions (PR F contract)                                 | ✔ holds |
| `QuestDefinition`, `DialogueNode`, `WorldMapDefinition`, `NpcDefinition`, `MapTransition` remain the principal content contracts | all still declared in `src/domain/` + `src/content/types.ts` and referenced by validation                                                                 | ✔ holds |

The required chain holds end to end:

```text
AUTHORED CONTENT → VALIDATION → PURE DOMAIN/RUNTIME → PRESENTATION (R3F world + child UI)
```

`No change required; our current boundary already provides the relevant invariant` —
for every reference pattern audited, the same invariant is either already satisfied
here by a stronger mechanism, or deferred by product decision rather than by missing
architecture.

The interesting question for us, sharpened by the references:

> Where is the boundary between **authored content** and **executable runtime
> behavior**?

Our current chain, traced through the code:

```
AUTHORED DATA          src/content/fa/*.ts  (copy, icons, dialogue graph)
                       src/domain/quests/definitions.ts (QUEST_DEFINITIONS — mechanical data)
                       src/world/registry.ts, src/world/maps.ts (placement/navigation data)
        │
VALIDATION             src/content/validation.ts → scripts/validate-content.ts (build gate)
                       src/world/registry.test.ts (referential integrity)
                       src/domain/quests/interactionSteps.ts (budget, via validate)
        │
DOMAIN/RUNTIME         src/domain/quests/encounter.ts (phase machine)
                       src/domain/game/* (state, commands)
                       src/app/* (provider wiring)
        │
PRESENTATION           src/ui/child/contextInteraction.ts (contextForStep)
                       src/world/* (R3F), src/ui/child/* (DOM HUD)
```

Findings:

1. **The seam exists and is healthy.** `definitions.ts` is _already_ the
   Overworld/Atlas-style seam: mechanical quest structure referencing stable content
   IDs, with copy replaceable "without touching game logic" (its own doc-comment).
   The references did not expose a missing boundary — they validated ours.
2. **What the references do that we don't** is _indirection across_ the seam:
   `EffectRef`/`ConditionRef` (Overworld), command registries (Atlas), JSON schemas
   (Crafter). Every one buys flexibility at the cost of a resolution layer, and all
   are motivated by having _more authors than programmers_ — which this project does
   not have.
3. **Mixing check.** The genuinely mixed spots are thin and acceptable:
   `world/registry.ts` + `maps.ts` are authored _data_ living in the runtime folder
   (like RPGAtlas keeping `command-defs` next to the engine) — fine while small.
   `e2e/harness.ts` test probes correctly live outside `src/`. No gameplay rule was
   found inside a presentation component; `contextForStep` keeps the one derivation
   point.
4. **The one soft spot** the comparison sharpens: `QUEST_DEFINITIONS` declares
   `dialogueIds`/`npcIds`/`nextQuestIds` as plain string arrays whose integrity is
   checked by tests rather than by the content validator itself. Coverage is fine;
   it is worth _stating_ in the architecture doc that referential integrity is a
   validation responsibility (the invariant RPG Crafter enforces structurally and we
   enforce by test).

## Recommendations

### Adopt now

1. **State the authored-data→validation→runtime→presentation chain as an explicit
   invariant** in `docs/ARCHITECTURE.md` (amendment in this PR). All five references
   formalize this seam; ours exists but is implicit. Cost: a paragraph. Prevents the
   most likely future mistake — adding an interpreter layer no one needs.
2. **Keep "issues as data" validation.** `validateContent` already returns a
   structured report exactly like rpgcrafter's `ContentIssue` list and Overworld's
   `ValidationReport`. Declare that shape (report object consumed by script + tests,
   never thrown mid-runtime) the contract in the same amendment.

### Adapt later

1. **Content-package conventions from rpgcrafter** (`schemaVersion` + `engineRange`
   in a manifest, forward-migration module) — only if content becomes a distributable
   package or a second game exists. Our `PersistedState` already tolerates additive
   fields, which is the same philosophy applied to saves.
2. **Declarative `ConditionRef`-style gating on dialogue responses** (Overworld) —
   only if dialogue needs per-state branching beyond the current
   `dialogueIds`-per-spot resolution.
3. **Command-union `EncounterStep` evolution** (RPGAtlas precedent) — if quests need
   beats beyond choice/demonstrate, extend the step _type union_ interpreted by the
   existing reducer rather than adding an interpreter with injected services.
4. **`SceneJson`-style structural doc** (Overworld) — the right pattern for any future
   authoring tool: the editor exports a document that is _structurally_ our registry
   shape, with zero imports shared.

### Study only

- `ObjectiveTrigger` bus auto-progress (Overworld) — elegant, but our quests are
  scripted encounters, not objective counters.
- RPGJS module/DI/hook machinery — solves server/client symmetry we don't have.
- React RPG thunk turn drivers — the strategy-per-data-field idea, minus the
  `getState()` reads.
- `MapEventRuntime` trigger taxonomy (rpgcrafter) — a useful catalogue of trigger
  types our child model deliberately excludes.

### Explicitly reject

- **Autorun/parallel event triggers** (RPGAtlas, rpgcrafter) — let content start
  sequences without a child action; violates the interaction budget.
- **Server/client authority split and DI containers** (RPGJS) — wrong problem for an
  offline single-player PWA.
- **Imperative `onAction` → `showText` event classes** (RPGJS) — adds forced
  interaction steps; wrong direction for a ≤2-action budget.
- **Thunk-style actions reading `getState()` mid-dispatch** (React RPG) — moves
  decisions out of the reducer; regresses domain purity.
- **JSON-ification of `src/content`** now (rpgcrafter) — trades compiler-checked TS
  data for a schema toolchain with no new consumer.
- **Silent no-op dispatch** (RPGAtlas interpreter) — our validator failing loudly on
  unknown references is the better default for a children's product.

---

## Top 5 architectural lessons

**1.**

- _Lesson:_ The strongest recurring pattern is "content is data referencing behavior
  by id, resolved through a registry" (Overworld `EffectRef`, RPGAtlas command
  registry, rpgcrafter trigger types).
- _Evidence:_ `overworld/packages/core/src/registry.ts`; `RPGAtlas/src/engine/
interpreter/registry.ts`; `rpgcrafter/apps/player/src/event-runtime.ts`.
- _Our boundary:_ `QUEST_DEFINITIONS` already does this by convention — steps declare
  icon/landmark/dialogue _ids_; `contextForStep` + the reducer are our registry.
- _Action:_ None needed now. Recognize it as the same pattern, deliberately un-named;
  name it in `ARCHITECTURE.md` so future changes don't bolt a second resolution layer
  next to it.
- _Risk:_ Low. Naming it risks inviting premature generalization — mitigated by the
  "adapt later" gating.

**2.**

- _Lesson:_ Persistence should be namespaced, versioned, backend-swappable, and
  migrated forward — never reject old data.
- _Evidence:_ `overworld/packages/core/src/persist.ts` (`persistOptions`: prefix,
  version, `partialize`, `migrate`, `createMemoryStorage`);
  `rpgcrafter/packages/game-schema/src/migration.ts` (forward-migration chains).
- _Our boundary:_ `src/services/persistence/repository.ts` — versioned
  `PersistedState`, additive tolerant fields, corrupt → fresh (never deletes).
- _Action:_ Our model already matches; add _migration tests_ (rpgcrafter's
  `migration.test.ts` pattern) the next time the persisted shape changes, not before.
- _Risk:_ Low.

**3.**

- _Lesson:_ Editor/authoring tooling should meet the runtime at a _document or
  schema_, never by importing runtime code.
- _Evidence:_ `overworld/packages/scene/src/sceneJson.tsx` (structural identity, zero
  imports); `rpgcrafter` `game-schema` as the sole shared package; RPGAtlas editor
  editing the same command lists the interpreter runs.
- _Our boundary:_ no editor exists; `content/fa` + `validate:content` is the seam
  where one would attach.
- _Action:_ Defer. Record the pattern so that if authoring tooling appears, it is
  built against a document (our `QuestDefinition`/`DialogueNode`/`WorldMapDefinition`
  types serialized), not against `src/app` or `src/world`.
- _Risk:_ None while deferred; high if an editor is ever wired to runtime internals.

**4.**

- _Lesson:_ Deterministic, pure state machines beat dispatch-thunks and event
  triggers for testable gameplay.
- _Evidence:_ react-rpg's `takeMonstersTurn` guards against mid-pass mutation
  (`monster === undefined`) — a bug class our reducer makes impossible;
  `overworld` injects `clock` "when replayed sessions must produce byte-identical
  state," endorsing the same principle.
- _Our boundary:_ `encounter.ts` pure `(state, command) → state`; invalid commands
  return the same object; `usePacedAdvance` only _times_ transitions.
- _Action:_ Keep rejecting models that read state inside action dispatch. No change.
- _Risk:_ None.

**5.**

- _Lesson:_ Every mature reference keeps a hard line between "what the engine knows"
  and "what the content declares" — and every one arrives there via a _typed
  document_, not via loose maps.
- _Evidence:_ `QuestDefinition`/`DialogueTree` (Overworld types.ts); Zod strict
  schemas (rpgcrafter schema.ts); `command-defs.ts` (RPGAtlas).
- _Our boundary:_ `QuestDefinition`, `DialogueNode`, `WorldMapDefinition`,
  `NpcDefinition`, `MapTransition` — our typed documents already exist.
- _Action:_ Treat these types as the public content contract; additions to child
  content belong as new _fields/variants on these types_, validated — never as ad-hoc
  runtime flags in `src/app` or `src/world`.
- _Risk:_ Low.

## Recommended next architectural step

**Write the authored-content seam into `ARCHITECTURE.md` as an invariant**
(done in this PR): declare that `QuestDefinition` / `DialogueNode` /
`WorldMapDefinition` / `NpcDefinition` / `MapTransition` are the game's content
contract — authored data flows through `validate:content` into the pure domain and is
rendered, never executed imperatively — and that referential integrity across those
ids is a validation responsibility.

This is the highest-leverage step because it is the cheapest possible insurance
against the exact failure all five references spend machinery avoiding: gameplay
rules leaking into presentation, or a second resolution layer appearing because the
existing seam was invisible. It requires no dependency, no refactor, and is fully
compatible with the interaction model and the PR F animation contract.

## Final report

1. **Files inspected (this repo).** `src/domain/quests/{definitions,encounter,interactionSteps,prerequisites}.ts`,
   `src/domain/game/types.ts`, `src/domain/world/types.ts`, `src/content/fa/*`,
   `src/content/{types,validation}.ts`, `src/services/persistence/*`,
   `src/world/{registry,maps,camera,critters,useCritters,CameraRig,Hub,CaveWorld,WorldCanvas}.ts(x)`,
   `src/ui/child/{contextInteraction,SceneChoice,EncounterPanel,screens}.tsx`,
   `src/app/*`, `e2e/*`, `scripts/{validate-content,measure-world,qa-screenshots,check-budgets}.ts`,
   `docs/{ARCHITECTURE,INTERACTION-MODEL,ANIMATIONS,QA}.md`, `AGENTS.md`.
2. **Reference repositories inspected.** All five at the pinned commits in the table
   above — source trees (not READMEs) across `packages/`, `src/engine`,
   `apps/player|studio`, `packages/game-schema`, and `src/features`.
3. **Invariants confirmed.** The six checks in "Invariants confirmed": content is data,
   presentation owns no gameplay state, domain imports no presentation, renderer
   defines no quest rules, animation defines no game state, and the five content
   contract types remain the principal seam.
4. **Genuine gaps.** None requiring code. The only soft spot: content-id referential
   integrity is enforced by tests rather than stated as an invariant — closed
   documentation-side by the `ARCHITECTURE.md` authored-content-seam amendment.
5. **Changes made.** This document; a one-invariant amendment to
   `docs/ARCHITECTURE.md`; an `AGENTS.md` documentation-map entry. Production code
   changes: NONE. Dependencies added: NONE.
6. **Changes deliberately not made.** No event bus, no interpreter, no DI, no
   Redux/Zustand, no JSON conversion, no editor, no multiplayer architecture, no
   trigger/autorun event model, no changes to the interaction model or the PR F/PR #33
   animation contract.
7. **Verification result.** `npm run verify`: PASS (format, lint, typecheck, 228
   vitest tests, build + content validation + budgets). `npx playwright test`: 79
   passed / 3 skipped (both projects; run anyway despite the docs-only diff).
   `scripts/measure-world.ts` and `scripts/qa-screenshots.ts`: FAIL — but produce
   byte-identical failures on `main` (stale renderer ceilings and the removed
   `badge-0` step); pre-existing, unrelated to this diff.
8. **Recommended next architectural step.** Keep the five references as a precedent
   library at their assigned layers (Overworld → renderer/world, RPGJS → RPG domain
   catalogue, RPGAtlas → engine/editor boundary, RPG Crafter → content contract,
   React RPG → turn/action). The next concrete step, when it arises, is whichever
   "Adapt later" item a real requirement triggers first — most likely the
   `manifest`/`schemaVersion`/migration convention if content ever becomes a
   distributable package.
