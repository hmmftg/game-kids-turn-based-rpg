# Framework extraction — dependency map and boundary (P3)

The dependency-extraction deliverable required by the plan before any file
move: the import map of every file nominated for `src/framework/`, and what
the proof actually permitted to move. **Import direction is one-way** —
application → framework, never the reverse — and every application import of
framework code (including type-only) goes through `src/framework/index.ts`
(`no-restricted-imports` in `eslint.config.js`, verified to fire).

## Layout

```
src/framework/
  index.ts            single public entry — the smallest viable seam, NOT yet stable
  core/
    identifiers.ts    AnchorId LandmarkId NpcId MapId DiscoveryId AreaId TransitionId
    world.ts          Bounds Anchor Edge WorldArea WorldMap MapTransition NpcPlacement
    geometry.ts       insideBounds
    graph.ts          GraphSource<A extends Anchor> + memoized lookups
                      (getAnchor, getAnchorOrNull, neighboursOf, distanceBetween,
                       anchorForNpc, anchorForLandmark)
    pathfinding.ts    nearestWalkableAnchor, findPath (A*), pathToPoints, PathPoint
    quality.ts        QualityTier
    capabilities.ts   detectWebgl, detectQualityTier, maxPixelRatioFor,
                      currentOrientation, prefersReducedMotion
    runtime.ts        ReducerContext, GameRuntimeAdapter<S,C>, GameRuntime,
                      createGameRuntime
    persistence.ts    SaveScope, LoadResult<P>, PersistenceFailure,
                      StorageFallback, PersistenceAdapter<P>
    perfProbe.ts      ?perfprobe=1 probe — NOT re-exported (deliberate lazy chunk)
  three/
    camera.ts         pure follow-camera math (ISO offset, zoom bands,
                      clampCameraTarget, focus-override resolution)
  modules/
    battle/           the micro turn-based battle machine
                      (types, battle.ts, reducer.ts, validation.ts + its tests)
```

## Import map → resolution

| File                                                                                  | App imports found                                                                                                                                 | Resolution                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/world/types.ts`                                                               | `AnchorId`/`LandmarkId`/`NpcId` from `domain/game/types.ts` (a real type cycle — game types re-exported `MapId`/`DiscoveryId` _from_ world types) | Identifiers moved to `core/identifiers.ts`; both sides now import from the index — one direction, no duplicates                                                                                                       |
| `services/device/capabilities.ts`                                                     | `QualityTier` from `domain/game/types.ts`                                                                                                         | `QualityTier` moved to `core/quality.ts`; the whole file moved to `core/capabilities.ts` (old path is a re-export shim)                                                                                               |
| `world/camera.ts`                                                                     | `MapId` + `getMap` (map registry)                                                                                                                 | Split: pure math → `three/camera.ts`; `zoomForMap`/`cameraPaddingForMap` (map lookup) stay app-side                                                                                                                   |
| `domain/world/geometry.ts`                                                            | `Bounds` only                                                                                                                                     | `insideBounds` → `core/geometry.ts` (old path = shim)                                                                                                                                                                 |
| `world/navigation/graph.ts` + `pathfinding.ts`                                        | identifiers + `WorldSource`                                                                                                                       | Lookups/A* moved to `core/graph.ts` + `core/pathfinding.ts`, parameterized on a minimal `GraphSource<A extends Anchor>`; the authored `ANCHORS`/`EDGES` data stays in `world/navigation/graph.ts` (old paths = shims) |
| `domain/battle/*`                                                                     | `NpcId`, `DiscoveryId` only                                                                                                                       | Moved whole to `modules/battle/` — compiles on identifiers alone. The game-reducer half of `battle.test.ts` moved to `domain/game/battle.test.ts` (it tests the app's command boundary, not the machine)              |
| `services/device/perfProbe.ts`                                                        | none                                                                                                                                              | `core/perfProbe.ts`; `main.tsx` keeps the direct dynamic import so the probe stays its own lazy chunk — routing it through the index would pull it into the eager graph. It is the one sanctioned index bypass        |
| `domain/game/types.ts`                                                                | re-exported `MapId`/`DiscoveryId`                                                                                                                 | Now imports identifiers + `QualityTier` + battle types from the index and re-exports them — zero churn for existing importers                                                                                         |
| `domain/world/types.ts`                                                               | identifiers                                                                                                                                       | Now extends core primitives: `Anchor` = core anchor + `labelFa`; `WorldArea`/`WorldMapDefinition` add labels/environment; `Npc*`/`EnvironmentDefinition` stay app-owned                                               |
| `domain/world/source.ts`                                                              | types only                                                                                                                                        | Stays app: `WorldSource` carries `NpcDefinition` (archetype/schedule/dialogueIds — app content) and structurally satisfies `GraphSource`                                                                              |
| `domain/quests/encounter.ts`, `interactionSteps.ts`, `definitions.ts`, dialogue-graph | `QuestId`/`IconId`, quest definitions, `content/fa` dialogue nodes                                                                                | **Not extractable** — they import application-owned content and identities. They remain application gameplay code; the plan's "optional module" classification is deferred to `hello-world` evidence                  |
| `services/persistence/repository.ts`                                                  | `PersistedState`, `AvatarId`, `HeadwearId`                                                                                                        | App-owned: `PersistedState`, profile model and the concrete `SaveRepository` stay; `PersistenceAdapter<P>` in core is the generic contract the app's coordinators wrap in P4                                          |

## What the runtime owns (P3 contract)

`createGameRuntime<S, C>(adapter, { clock? })` — one store, fed by the
injected reducer; `dispatch` stamps `{ now }` from the clock on **every**
command; `subscribe`/`pause`/`resume`/`dispose`. `createInitialState()` takes
no hydrated input and runs once. Persistence is a separate interface consumed
by the application's own coordinators — the runtime performs none.

## Deliberately not moved

- `labelFa`, `NpcArchetype`, `NpcSchedule*`, `EnvironmentDefinition`,
  `dialogueIds` — application content/presentation. `hello-world` (P5) proves
  whether any shared contract is needed; the API does not expand ahead of it.
- `QuestId`/`IconId`/`StickerId`, `GameState`/`Command`/`PersistedState`,
  `DISCOVERY_IDS`, quest/dialogue content — application-owned, not exported.
- `world/camera.ts`'s `zoomForMap`/`cameraPaddingForMap` — authored-map lookup.
- Encounter machine, interaction steps, quest-chain helpers — see table.

## Old-path shims (mechanical churn avoidance)

`domain/world/geometry.ts`, `world/navigation/graph.ts`,
`world/navigation/pathfinding.ts`, `services/device/capabilities.ts`,
`world/camera.ts`, `domain/world/types.ts`, `domain/game/types.ts` re-export
from the index so existing imports keep working. New code should import
framework APIs from `src/framework/index.ts` directly.

API stability: **not declared**. P5's `examples/hello-world` validates,
refines, or removes exports before this is called public.
