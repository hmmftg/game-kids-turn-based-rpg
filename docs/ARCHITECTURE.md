# Architecture

High-level map of the codebase. For setup and scripts see [README.md](../README.md); for rules
agents must follow see [AGENTS.md](../AGENTS.md).

## Layers

```
content/fa ──► domain ──► app (provider wiring) ──► ui/child + ui/parent
                    ▲              │
services ───────────┘         world/ (R3F hub)
```

| Layer     | Path              | Contract                                                                     |
| --------- | ----------------- | ---------------------------------------------------------------------------- |
| Domain    | `src/domain/`     | Pure TypeScript. No React/DOM/Three imports. Protected — see AGENTS.md §1.1. |
| Content   | `src/content/fa/` | All child-facing copy + icon semantics; `validate:content` enforced.         |
| World     | `src/world/`      | R3F hub: models, waypoint navigation, ambient critters.                      |
| Child UI  | `src/ui/child/`   | DOM HUD (RTL), dialogue cards, contextual targets, quest trail.              |
| Parent UI | `src/ui/parent/`  | Press-and-hold gated settings.                                               |
| Services  | `src/services/`   | IndexedDB persistence, audio, capabilities, PWA.                             |
| App       | `src/app/`        | Provider wiring domain ↔ services ↔ UI.                                      |

## Key invariants

- **Domain purity**: `domain/` never imports React, Three, or DOM APIs. All transitions are pure
  `(state, command) → state`; invalid commands return the _same object_.
- **Encounter machine** (`domain/quests/encounter.ts`):
  `intro → demonstrate → playerChoice → worldResponse → reinforce → complete`.
  Wrong choice → back to `demonstrate` (`retries + 1`). No failure state.
- **Passive pacing** (`usePacedAdvance` in `EncounterPanel`): every phase except
  `playerChoice` auto-fires `ADVANCE` after `PASSIVE_DWELL_MS` (1.4s→0.7s). The reducer
  stays the source of truth — the hook only decides _when_ the UI requests a state
  transition; one timeout per phase, cleared on unmount/phase change, paused while
  the tab is hidden, restarted on visibility restore. Auto-advance never auto-selects:
  only a real tap on the concrete object fires `CHOOSE`.
- **Commands**: child taps dispatch `CHOOSE(iconId, correct)` — interaction visuals are
  _implementation details on top_, never a second action system.
- **Persistence**: versioned schema, corrupt → fresh state (never deletes payload), checkpoint
  watermarks prevent celebration replays on hydration.
- **Rendering**: `frameloop="demand"`, orthographic camera, raycast only on ground/hotspot rings,
  quality tiers, no persistent animation loops, reduced-motion freezes decoration not meaning.
- **RTL**: all text in the DOM, never inside WebGL. No `row-reverse` on the quest trail.

## The interaction stack (child flow)

```
quest/domain state (EncounterState)
        │
        ▼  contextForStep()                      src/ui/child/contextInteraction.ts
ContextInteraction { phase, held, objects[] }
        │
        ▼  InteractiveTarget / SceneChoice       src/ui/child/SceneChoice.tsx
physical tappable things (one primary target)
        │  tap → 160ms press pulse → CHOOSE(iconId)
        ▼
response card: ConsequenceScene only if correct  src/ui/child/SceneChoice.tsx
```

Details and invariants: [INTERACTION-MODEL.md](INTERACTION-MODEL.md).

## Interaction budget

`domain/quests/interactionSteps.ts` measures **mandatory child actions** on the
interaction graph (passive 0 / choice 1 / entry 1 / exit 0 / optional taps 0) and
`validate:content` fails the build over the limits in `INTERACTION_LIMITS`
(step ≤2, dialogue ≤1, exit 0). New content must fit the budget — see
`docs/INTERACTION-MODEL.md` § Interaction budget.

## Ambient world

- One shared `useCritters` controller (`world/critters`) drives birds/cats/eagle/fish: setTimeout
  schedules, occupancy claims (`spotId`/`restSpotId`), zero `useFrame` per critter, disabled
  critters freeze instantly and snap back to their last settled transform.
- ModelSet boundary (`world/models/modelProvider.ts`) keeps cubic art swappable for GLB.

## World content model (data-driven)

Growing the world means adding **data**, not components:

- **Areas** (`domain/world/types.ts` + `world/registry.ts`): `WorldArea {id, labelFa, bounds,
spawnAnchorId}`. Every anchor — and therefore every NPC, landmark, hotspot and decoration —
  belongs to exactly one area (`anchor.areaId`, `npc.homeAreaId`). Shared world coordinates;
  areas are joined by authored nav edges that cross bounds.
- **NPCs**: `NpcDefinition {id, archetype, anchorId, homeAreaId, schedule?, dialogueIds}` — adding
  one is a registry row + a copy row + a look row (`world/npcLooks.ts` maps definition → palette/
  hair/role of the shared cubic archetype). `NpcSchedule.spots` moves an NPC between authored
  anchors deterministically (`resolveNpcAnchor`), event-driven, no per-frame work.
- **Activation**: the hub derives `activeAreaId` from `walker.at`; only NPCs standing in
  `visibleAreaIds(active)` (active + adjacent) mount figures, markers or landmarks. More
  definitions never means more per-frame work; `frameloop="demand"` unchanged.
- **Dialogue graph** (`content/fa/dialogue.ts`): `DialogueNode` carries optional `lines[]`
  (one beat at a time), `choices[]` (stable ids → `nextNodeId` branch) and `nextNodeId`
  (linear continuation), plus non-text cues (`emotion`/`reaction`/`pose`/`soundCue`,
  `parentNoteFa`). `OPEN_DIALOGUE` retargets the open node in `dialogue` mode — branches need
  zero reducer changes beyond that.
- **Quests as references**: `QuestDefinition` also declares `areaId`, `npcIds`, `dialogueIds`
  and `nextQuestIds`; `questChain()` walks the chain. Validation + `registry.test.ts` keep every
  reference resolvable and every node reachable.
- **Area activities as quest data**: each expanded area gets its gameplay identity from a quest,
  not code — park (return the fallen kite), river (spot a fish, collect a shell), market (carry
  the loaf to the shop shelf), school (answer by tapping the right picture). Steps reuse the
  existing `EncounterStep`/contextual-target model; adding an activity is content data
  (quest def + copy + icon → scene element/held item/consequence mappings).
- **NPC routines** (`NpcSchedule`): authored `spots` sequence moves an NPC between anchors
  deterministically (`resolveNpcAnchor` picks the spot from a world-clock tick that advances
  on anchor arrivals). Schedule movement is event-driven — walking to a person never ticks
  the clock, so an NPC cannot relocate mid-approach. Contextual dialogue: `dialogueIds`
  resolve per current spot (e.g. the fisher greets differently at the river vs the bakery).
  NPC figures are themselves tappable (invisible hit cylinder, deterministic jitter to
  disambiguate co-located NPCs) — tapping a figure is the only way to open dialogue.
- **Camera** (`world/camera.ts` + `world/CameraRig.tsx`): player-following orthographic
  rig. `clampCameraTarget` projects map bounds at the current zoom/aspect so the viewport
  never shows outside-map space; the rig lerps toward the clamped walker position,
  invalidating only while settling (idle → zero frames; reduced motion → snap). Per-map
  `cameraZoom` override; `mapId` remounts the rig and snaps to the map's spawn anchor.
  Child gestures: drag pans within bounds (a walk command snaps back to the child),
  tapping a quest chip walks the child to the quest NPC's current routine spot, and
  taps anywhere on the ground — near or far — walk there.
- **Maps** (`world/maps.ts`): `WorldMapDefinition {id, bounds, spawnAnchorId, environment}` —
  the outdoor town (`map-town`) plus secondary scenes with a local coordinate system and their
  own environment (`map-cave`). Only the current map's scene mounts (`WorldCanvas` keys
  `Hub`/`CaveWorld` by map). Every anchor carries `mapId`; navigation edges never cross maps
  (validated), so `findPath` can't wander across scenes. Travel between maps is **data**: an
  anchor's `transitionId` → a `MapTransition {fromMap, fromAnchor, toMap, toAnchor,
discoveryId?}` row that `App.onArrive` resolves into `DISCOVER` (once — a persisted world
  fact in `state.discoveries`) then `CHANGE_MAP`. Quests declare `mapId` so a secondary-map
  quest never mounts or trails on the wrong map. Adding another interior is a data task:
  map row + anchors + transition rows + optional scene component.
- **Persistence — maps/discoveries**: `PersistedState` gained additive, tolerant fields
  (`discoveries`, `mapId`, `mapAnchorId`) — no schema bump; old saves parse to town defaults.
  `mapAnchorId` is the _spawn_ on the active map (set only by `CHANGE_MAP`, not by walking),
  so a reload replays the same map and a safe local spot.

## Budgets

- Renderer calls per tier (observed sampled maxima, not bounds): low 76 / medium 203 / high 296.
- Ceilings live in `scripts/measure-world.ts`; gzip budgets in `scripts/check-budgets.mjs`.
- Activation: at most 8 NPC figures per visible-area set — enforced by `world/registry.test.ts`.
- QA and lifecycle/perf tooling: [QA.md](QA.md).
