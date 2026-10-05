# Contextual interaction model

The child-facing interaction contract, settled in PRs #17–#19. This document is the reference for
anyone touching the encounter/choice UI.

## Principle

Children ages 3–7 do not decode abstract action icons. The interaction language is **the thing**:

> see the thing → touch the thing → see what happens

There is no action vocabulary on the child's main surface. `CHOOSE(iconId)` is an implementation
detail — the child never sees it.

## The flow

```
ContextInteraction (pure model)
        │
        ▼
  primary target            secondary targets
  (one, strong affordance)  (visible, weaker)
        └─────────┬─────────┘
                  ▼
                 tap
                  ▼
        ~160ms press pulse        ← the ONLY pre-commit feedback
                  ▼
            CHOOSE(iconId)
                  ▼
        ┌─────────┴─────────┐
    correct                 wrong
        ▼                     ▼
ConsequenceScene      CharacterReact(actor,
(physical consequence)   questioning)
                      (NO success animation —
                       object stays put)
```

**Truthfulness rule — the most important one.** Never show an accepted-looking animation before
`CHOOSE` resolves. A "place" animation followed by gentle-retry teaches the wrong thing to a
pre-reader. Pre-commit feedback is limited to the press pulse.

## The model (`src/ui/child/contextInteraction.ts`)

```ts
interface SceneObject {
  iconId: IconId; // existing CHOOSE command id — implementation detail
  element: SceneElement; // the physical thing drawn (leaf, bin, person, shelf…)
  role: 'object' | 'destination' | 'actor' | 'escape';
  isCorrect: boolean; // iconId === step.correctIconId
  prominence: 'primary' | 'secondary';
}
```

Rules:

- **One obvious target at a time.** Exactly one object is `primary`: the correct one. Wrong
  objects stay tappable (their tap still fires `CHOOSE` → gentle retry) but are `secondary`
  (`.st-secondary`, dimmed/smaller); `role: 'escape'` renders faintest (`.st-escape`).
- `role` is metadata for theming/extensibility — it does **not** decide prominence.
- `held` ('leaf'|'basket'|null) shows the held-object marker on place-type steps via `HELD_ITEM`.
- `contextForStep(questId, stepIndex)` is pure; the visual layer must not re-derive correctness.

## Element map

`sceneElementFor(iconId)` maps each choice to a distinct physical target or `null`. A `null`
mapping means the choice **cannot be offered** (e.g. `icon-kick` shares the leaf's target — it
would make "which thing do I touch?" ambiguous, so it is simply absent). Extending the map: add
distinct elements for genuinely new world things; never map two meanings onto one shape.

## Consequence scenes

`ConsequenceScene(iconId)` renders the truthful physical consequence on the response card
after a correct choice — object lifted into the hand (pick), object flown to its
destination (give/place), the asked object opened (book). A wrong choice gets
`QuestioningReact` — a single `CharacterReact(actor, questioning)` — and the wrong object
stays physically where it is. One-shot CSS (`scene-exec-*` keyframes), frozen under
`prefers-reduced-motion`. Every consequence records a semantic episode on
`window.__worldAnimationEvents` (see `docs/ANIMATIONS.md`).

## Fallbacks and surfaces

- `ActionGlyph` is deleted (PR D). The demonstrate phase shows the physical target via
  `SceneGlyph`; dialogue choices and navigation chips are object chips. Do not reintroduce
  an icon row anywhere.
- Instructional text stays minimal (step text ≤9 words, prompts ≤6 — enforced by kidUx tests).

## Accessibility routes (PR N1)

One domain action, one world meaning, multiple presentation routes — never a
second interaction system:

- **Nearby sheet** (`NearbySheet` + `nearby-button`, bottom inline-end): the
  people and critters a figure tap would reach, as large DOM rows
  (`min-block-size` = `--touch-min` + 12). `nearbyNpcs()` resolves who stands
  where through the same `resolveNpcStand` + `NPC_STAND_OFFSET` the world
  renders; a row dispatches the exact same `onNpcTap` (walk + greet +
  dialogue, or `START_BATTLE` for the mouse). Outside-tap dismisses, same as
  every child modal.
- **Locked hotspots are not silent**: an inactive `Hotspot` no longer
  `stopPropagation`s — the tap falls through to the ground's normal
  walk/glance semantics. Silent dead zones are a comprehension failure.
- **Touch volumes (audit)**: humanoid figure cylinders r=0.9u (~115px at
  `DEFAULT_ZOOM`), hotspots r=0.9u, DOM controls ≥ `--touch-min` (64px). The
  critter cylinder stays r=0.45u (~58px) _deliberately_ — enlarging it
  reintroduces swallowed path taps near the fountain; its accessible route
  is the Nearby sheet instead of a bigger invisible volume.

## Battle ownership (PR I)

A battle is a self-contained interaction owner: while `GameState.battle !== null`
the `BattleScene` overlay covers world input, the quest trail and pause — the
only exits are the physical actions (ball/cushion, one per round) and the leave
button (`LEAVE_BATTLE`). The reducer enforces the same boundary. Launch is a
deliberate figure tap on the opponent NPC only; arrival never starts it. Details:
`docs/BATTLE-MODEL.md`.

## Interaction budget (hard validator)

`src/domain/quests/interactionSteps.ts` counts **mandatory child actions** on the interaction
graph — not dialogue structure or copy length:

| surface                           | mandatory actions |
| --------------------------------- | ----------------- |
| passive beat (any phase ≠ choice) | 0                 |
| object choice (`playerChoice`)    | 1                 |
| entering an interaction           | 1 (arrival tap)   |
| outside-tap dismissal             | 0 — always free   |
| optional dialogue tap (lines)     | 0 — never forced  |

Limits (`INTERACTION_LIMITS`), enforced as `interaction-budget` errors by
`validate:content` and by `interactionSteps.test.ts`:

- standard step: ≤ 2 (every step today: 1)
- routine dialogue: ≤ 1 on the heaviest required-choice path
- dialogue with no required choice: 0 to exit

One meaningful child action produces one meaningful game consequence — the validator is the
ratchet that keeps it true.

## Test invariants (`sceneChoice.test.tsx`)

- Every step exposes ≥1 concrete target; the correct choice is always a physical target.
- Exactly one `primary` object per step.
- Physical target → correct existing `CHOOSE` semantics (pick/place/talk covered).
- Wrong targets remain tappable and mark `correct: false`.
- Double-tap commits once.
- No glyph row / unmapped choices absent.
- Consequence renders only on correct response.
- Integration: real `applyChoice`/`advancePhase` chain → next step shows held + destinations.
