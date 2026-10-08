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
- **Battle machine** (`domain/battle/`): session-only `GameState.battle` (never persisted,
  never a `Mode`). `intro → playerChoice → playerResolution → enemyResolution →
roundCheck → playerChoice | victory | defeat`; terminal victory/defeat exit only via
  `LEAVE_BATTLE`. Deterministic outcome matrix, one child action/round. While
  `battle !== null` the reducer blocks `OPEN_DIALOGUE`/`START_QUEST`/`CHANGE_MAP`/
  `DISCOVER`/`PAUSE`/`SWITCH_PLAYER` — battle input ownership is enforced in the
  UI overlay _and_ the domain. Full contract: `docs/BATTLE-MODEL.md`.
- **Persistence**: versioned schema, corrupt → fresh state (never deletes payload), checkpoint
  watermarks prevent celebration replays on hydration.
- **Spatial visibility**: the camera never frames outside `map.bounds − cameraPadding`,
  so that inset rect is the _guaranteed-visible region_. `placement.ts` is the single
  source for anchor-derived positions (`landmarkPosition`, `NPC_STAND_OFFSET`,
  `CAVE_MOUSE_OFFSET`, `caveEntranceRockPosition`, `FOUNTAIN_BASIN` in `critters.ts`)
  — derived visuals never carry independent coordinates. `visibility.test.ts` enforces:
  every interactive anchor, landmark render position, NPC figure position
  (anchor + stand offset + jitter) and the cave rock stays inside the guaranteed
  rect with `INTERACTION_CLEARANCE`, and fish rest/swim inside the water disc.
- **Navigation legibility**: the tap→go chain reads physically. `useWalker` holds a
  ~220ms orientation beat before a large heading change (the avatar visibly turns
  toward the chosen spot), eases heading during the walk, and publishes `focus` —
  position plus a ~2.4u lead toward the current hop — so the follow camera frames
  the destination before arrival rather than only on arrival. A ground tap that
  resolves to no anchor earns `faceToward` (an honest glance, never a silent
  dead tap). HUD chrome rows (`hud__top`, `hud__side`, `hud__bottom`) are
  pass-through containers: only their actual controls are hit targets, so empty
  band space can never swallow a world tap; disabled trail stops are pictures,
  not verbs (`pointer-events: none`).
- **Pacing legibility**: every passive beat carries a perceivable cause — the
  model is _state change → visible physical cause → short meaningful beat →
  next state_, never _state change → timer → state change_. Beats arrive
  physically: each `DialogueCard` remounts per phase/dialogue line
  (`key={phase}` / `key={nodeId:lineIndex}`) and plays a one-shot `card-arrive`
  entrance, so "a new thing happened" never depends on reading. The
  `reinforce` step-win beat keeps the consequence at its destination
  (`ConsequenceScene settled` — the episode's static end-state, same picture
  reduced-motion renders) instead of re-showing repeated copy: the "after"
  persists through the celebration until the next ask begins. Battle
  resolutions stage the opponent (`data-phase`/`data-outcome`/`data-intent`):
  recoil on a hit, lunge on attack, settle on rest, gone on victory. No Next
  buttons, no new taps — `usePacedAdvance` still owns all passive timing.
- **Rendering**: `frameloop="demand"`, orthographic camera, raycast only on ground/hotspot rings,
  quality tiers, no persistent animation loops, reduced-motion freezes decoration not meaning.
- **RTL**: all text in the DOM, never inside WebGL. No `row-reverse` on the quest trail.
- **Authored-content seam**: `QuestDefinition`, `DialogueNode`, `WorldMapDefinition`,
  `NpcDefinition`, `MapTransition` are the game's content contract. Authored data flows
  through `validate:content` into the pure domain and is rendered — never executed
  imperatively; referential integrity across those ids is a pre-runtime validation
  responsibility, enforced by `validate:content` and dedicated registry/content tests
  where the validator does not currently own the relation — not a runtime fallback.
  New child content
  is new data or new fields on these types, never ad-hoc flags in `src/app`/`src/world`.
  Validation returns a structured report consumed by script + tests — it does not
  throw at runtime.

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
  own environment (`map-cave`, `map-challenge` — the discovery-gated Challenge Zone). Only
  the current map's scene mounts (`WorldCanvas` keys
  `Hub`/`CaveWorld`/`ChallengeWorld` by map). Every anchor carries `mapId`; navigation edges never cross maps
  (validated), so `findPath` can't wander across scenes. Travel between maps is **data**: an
  anchor's `transitionId` → a `MapTransition {fromMap, fromAnchor, toMap, toAnchor,
discoveryId?}` row that `App.onArrive` resolves into `DISCOVER` (once — a persisted world
  fact in `state.discoveries`) then `CHANGE_MAP`. Quests declare `mapId` so a secondary-map
  quest never mounts or trails on the wrong map. Adding another interior is a data task:
  map row + anchors + transition rows + optional scene component.
- **Discovery-gated walking**: an `Edge` may carry `requiresDiscoveryId` —
  the path exists only once that fact is in `state.discoveries`. App computes
  `worldForDiscoveries(source, discoveries)` (`worldSource.ts`), a pure edge
  filter that returns the identical source object when nothing is gated and
  shares every other collection by reference, and hands that world to
  `WorldCanvas` — navigation, anchors and transitions are untouched. The
  challenge-map gated edges open the Depths crossing after its two opponents
  are beaten; the blocked state is physical (a rockfall prop on the authored
  anchor), never a UI lock.
- **Discovery registry**: `domain/world/discoveries.ts` owns `DISCOVERY_IDS` +
  `isKnownDiscovery()`; `transition.discoveryId`, `Edge.requiresDiscoveryId`
  and `BattleDefinition.victoryDiscoveryId` all validate against it.
- **Persistence — maps/discoveries**: `PersistedState` gained additive, tolerant fields
  (`discoveries`, `mapId`, `mapAnchorId`) — no schema bump; old saves parse to town defaults.
  `mapAnchorId` is the _spawn_ on the active map (set only by `CHANGE_MAP`, not by walking),
  so a reload replays the same map and a safe local spot.

## Budgets

- Renderer calls per tier (observed sampled maxima, not bounds): low 76 / medium 203 / high 296.
- Ceilings live in `scripts/measure-world.ts`; gzip budgets in `scripts/check-budgets.mjs`.
- Activation: at most 8 NPC figures per visible-area set — enforced by `world/registry.test.ts`.
- QA and lifecycle/perf tooling: [QA.md](QA.md).
