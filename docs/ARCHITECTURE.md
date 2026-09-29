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

## Ambient world

- One shared `useCritters` controller (`world/critters`) drives birds/cats/eagle/fish: setTimeout
  schedules, occupancy claims (`spotId`/`restSpotId`), zero `useFrame` per critter, disabled
  critters freeze instantly and snap back to their last settled transform.
- ModelSet boundary (`world/models/modelProvider.ts`) keeps cubic art swappable for GLB.

## Budgets

- Renderer calls per tier (observed sampled maxima, not bounds): low 76 / medium 203 / high 296.
- Ceilings live in `scripts/measure-world.ts`; gzip budgets in `scripts/check-budgets.mjs`.
- QA and lifecycle/perf tooling: [QA.md](QA.md).
