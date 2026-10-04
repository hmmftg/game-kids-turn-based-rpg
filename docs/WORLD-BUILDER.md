# World Builder

A developer-facing authoring tool for world **structure** — maps, areas,
anchors, edges, transitions, and NPC home placements — that produces a
versioned `WorldBuilderDocument`. It is deliberately not a generic RPG
engine: it edits world structure only. NPC behaviour, quests, dialogue,
and gameplay state remain content-owned and untouched.

## Architecture

```text
src/world/*  (static registries)
      │
      ▼
src/worldbuilder/runtimeAdapter.ts   ← the ONLY module importing registries
      │
      ▼
src/domain/worldbuilder/document.ts  ← pure document model + validation
src/domain/worldbuilder/validation.ts
      │
      ▼
src/domain/world/source.ts (WorldSource)   src/domain/world/types.ts
      │                                        (Anchor, Edge, NpcPlacement)
      ▼
Builder UI (src/worldbuilder/BuilderApp.tsx)
```

Dependency rules (enforced by review, keep them true):

- `src/domain/worldbuilder/*` is pure — never imports `src/world/*`, even
  type-only. `document.ts` converts over a supplied `WorldRuntimeData`
  bundle; `runtimeAdapter.ts` constructs that bundle from the registries.
- `NpcPlacement` lives in `src/domain/world/types.ts` (a world-structure
  concept, not an editor concept). `world → worldbuilder` never exists.
- Resolution helpers are source-parameterized (`getAnchor(source, id)`,
  `findPath`, `resolveNpcStand`, `transitionForAnchor`, `visibleAreaIds`).
  No global mutable provider/context. The game binds `STATIC_WORLD_SOURCE`
  once in `App.tsx`; the builder preview binds a `DocumentWorldSource`.

## The document

`WorldBuilderDocument` is a versioned, serializable table set:

- `maps`, `areas` (`WorldBuilderArea = WorldArea & { mapId }` — area→map is
  authored, never inferred), `anchors` (no `npcId` — derived from
  placements), `edges`, `transitions`, `npcPlacements`.
- `NpcPlacement` = the NPC's **home/resident** spot only. Schedule spot
  anchors stay content-owned and are not editable here. Resolution:
  scheduled NPC → schedule spot wins; unscheduled → placement is home;
  offsets apply on top.
- The placement table is 1↔1: every `NpcDefinition` has exactly one
  placement, every anchor has at most one home placement. Omission is an
  invalid document — never "delete the NPC" or "use the runtime default".

## Validation

One validation system (`src/domain/worldbuilder/validation.ts`) checks
structural/reference/connectivity rules: reference integrity, bidirectional
transition consistency (`anchor.transitionId ↔ transition.fromAnchor`),
`anchor.mapId === area.mapId`, explicit spawn relations (exists / same map /
same area / walkable), and per-map BFS reachability over **walkable anchors
only** (non-walkable anchors and transitions excluded).

## Using the builder

Open `/?worldbuilder=1` (a plain query-param mount — works on the preview
build, no dev flag), or use the «ابزارهای ساخت» section of the parent area
(behind the press-and-hold gate — pause → parent entry → hold) which
navigates to the same URL. The toolbar offers Edit/Play, `+ Area`, `+ Anchor`,
a map selector, draft save/load (localStorage `worldbuilder.doc.v1`),
JSON export/import, and reset. The inspector edits the selected entity;
the viewport overlay renders the document (areas, anchors, edges,
transitions, placements) and supports drag-to-move anchors in Edit mode.

**Play** compiles the document through `documentToWorldSource` and renders
it in the same `WorldCanvas` the game uses — the proof that one edited
document drives real traversal without mutating registries. Arriving at a
transition anchor follows it to the target map/anchor.

## Acceptance fixture

`e2e/worldbuilder.spec.ts` builds a new area on `map-town` entirely through
the UI (area + two anchors + edges + spawn), exports JSON, reloads it via
import, enters Play, walks the authored graph into the new area, then walks
to the cave entrance and verifies the `map-town → map-cave` transition.

Round-trip acceptance is **semantic identity**: export → reload →
normalize → deep-equal (not byte-identical JSON).

Scope note: the fixture authors on `map-town` only. `WorldCanvas` has
map-specific render paths, so generic new-map authoring is a later
capability, not implied by the schema.

## Boundaries

The builder never mutates `GameState`, never calls gameplay commands, and
never imports `src/app/App.tsx`. There is no second validation system, no
`PersistedState` change, and no new `Mode`.
