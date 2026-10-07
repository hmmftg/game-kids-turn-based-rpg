# Battle Model (PR I — Micro Turn-Based Battles)

The micro battle is a **standalone toy activity** layered on the guided toy:
a deterministic 1v1 loop with a few hearts, a small round budget, and exactly
one child action per round. It deliberately does **not** grow the project into
an RPG engine — battle edits neither world structure nor quest structure.

## Boundary

- `GameState.battle: BattleState | null` is **session-only**: never persisted,
  never part of `PersistedState`, never a `Mode` — `mode` stays `'hub'` for
  the whole battle.
- Battle state lives in `src/domain/battle/` (pure — no React/DOM/timers).
- The battle owns all child input: the `BattleScene` overlay covers world,
  trail and pause, **and** the game reducer returns the same object for
  `OPEN_DIALOGUE`, `START_QUEST`, `CHANGE_MAP`, `DISCOVER`, `PAUSE`,
  `SWITCH_PLAYER` while `battle !== null` — a presentation bug cannot leak a
  world transition.
- Victory is standalone: `LEAVE_BATTLE` → `battle: null, mode: 'hub'`. No
  quest, sticker, checkpoint or celebration wiring.
- Launch is interaction-owned: only a deliberate tap on the opponent's
  figure (`onNpcTap` → `battleForOpponent(npcId)` → `START_BATTLE`). Arriving
  near the fountain never starts it.

## State machine (`src/domain/battle/`)

```
intro → playerChoice → playerResolution → enemyResolution → roundCheck
      → playerChoice | victory | defeat
```

- `playerChoice` is the only phase that waits for the child.
- `intro`, `playerResolution`, `enemyResolution`, `roundCheck` auto-advance
  (BattleScene dwell timers; a card tap skips ahead).
- `victory` / `defeat` are **terminal battle states**: `ADVANCE_BATTLE_PHASE`
  is a no-op there; `LEAVE_BATTLE` is the only exit.

`roundCheck` precedence (explicit — a resolved consequence beats the counter):

```
if opponentHearts <= 0  → victory
else if round >= maxRounds → defeat
else → playerChoice (round + 1, next authored intent)
```

## Outcome matrix (deterministic, fixed before visuals)

| Enemy intent | `action-ball`     | `action-shield` |
| ------------ | ----------------- | --------------- |
| `rest`       | opponent −1 heart | no effect       |
| `attack`     | ball whiffs       | shield blocks   |

No counter-damage to the child, no crits, no randomness, no punitive
failure — defeat only when the round limit expires.

## Content contract

- Rows live in `src/content/fa/battles.ts`: `BattleDefinition`
  (`battleId`, `opponentId`, `hearts`, `maxRounds`, `availableActions`,
  `enemyIntentPattern` — round N uses `pattern[(N-1) % len]`) plus a
  `BattleCopy` row (`introFa`, `promptFa`, `outcomeFa`, `intentFa`,
  `victoryFa`, `defeatFa`).
- `validate:content` checks: unique ids, opponent is a real NPC, positive
  budgets, non-empty actions/pattern, definition↔copy bidirectionality,
  **winnability** (rest rounds within the budget must reach zero hearts via
  an offered ball action), and the usual child-copy text rules.
  Definition-level rules live in `src/domain/battle/validation.ts`
  (`validateBattleDefinition`); winnability reuses `enemyIntentFor`, so the
  pattern **cycles** — `[rest, attack]` over 6 rounds yields three scorable
  rounds, not one literal entry. `src/domain/battle/reducer.ts`
  (`battleReducer` over `BattleState | null`) is the seam the game reducer
  delegates `START_BATTLE`/`CHOOSE_BATTLE_ACTION`/`ADVANCE_BATTLE_PHASE`/
  `LEAVE_BATTLE` to — same shape as the encounter delegation.
- The playful mouse (`npc-playful-mouse`) is the MVP opponent —
  `archetype: 'critter'`, rendered through the animal slot in
  `ChallengeWorld.tsx` (it moved to the Challenge Zone with the zone PR).
  Its pattern is all-`rest`: with 3 hearts in 3 rounds an `attack` round is
  mathematically unwinnable, so the first battle teaches the ball; the
  `attack`/`shield` rows stay in the model for future definitions.
- **Hearts ≤ 3 is a budget, not a constant.** Later opponents may run fewer
  hearts to free pattern rounds: the three Challenge Zone opponents
  (bird/eagle/butterfly) each take 2 hearts in 3 rounds with distinct intent
  patterns (`[rest,attack,rest]`, `[attack,rest,rest]`, `[rest,rest,attack]`),
  and the winnability validator still guarantees every definition is beatable.
- **`victoryDiscoveryId`** on `BattleDefinition` turns a win into a persisted
  world fact: `LEAVE_BATTLE` on a terminal victory is always a `stable()`
  transition (autosave fires); when the definition carries a
  `victoryDiscoveryId` not yet in `state.discoveries`, it is appended in the
  same transition — one reducer pass, one save. Defeat and mid-battle leaves
  keep the existing non-stable path. The recorded fact drives presentation
  (`resolveNpcPresentation`) and gated edges, nothing else.

## UI surface (`src/ui/child/BattleScene.tsx`)

- Physical actions only — the soft ball and the cushion are tappable
  `SceneGlyph` objects, never an action-icon row.
- Hearts, round dot and the leave button sit in the header; the opponent is
  a physical presence (`SceneGlyph 'mouse'`).
- Instrumentation (probe/dev only): `window.__worldBattleState` mirrors the
  live `BattleState`; `window.__worldBattleEvents` records one row per phase
  entry (`'phase@round'`, `'end'` on exit).
