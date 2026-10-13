# Battle Model (PR I — Micro Turn-Based Battles)

The micro battle is a **standalone toy activity** layered on the guided toy:
a deterministic 1v1 loop with a few hearts, a small round budget, and exactly
one child action per round. It deliberately does **not** grow the project into
an RPG engine — battle edits neither world structure nor quest structure.

## Boundary

- `GameState.battle: BattleState | null` is **session-only**: never persisted,
  never part of `PersistedState`, never a `Mode` — `mode` stays `'hub'` for
  the whole battle.
- Battle state lives in `src/framework/modules/battle/` (pure — no React/DOM/timers).
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

## State machine (`src/framework/modules/battle/`)

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

### Weakness (W7a)

Each opponent fears exactly one action: `BattleDefinition.weakness` adds
**+1 heart** to any _effective_ weak-to action (`damageFor`):

- `opponent-hit` deals 2 hearts instead of 1 (a feared thing lands harder),
- `blocked` deals 1 instead of 0 (a feared thing turns the attacker's
  own charge into a heart loss),
- `whiffed`/`no-effect` stay 0.

Weakness is communicated **physically** (§9): the opponent flinches toward
the feared object while the child chooses (`data-weakness` on
`.battle__opponent` — emitted only when the feared action is actually on
the strip) and recoils harder when it lands (`data-weak`) — never an icon
or text label. Every current opponent fears a **quest keepsake** (below):
the mouse fears the basket, the bird the kite, the eagle the crystal, the
butterfly the shell; a feared hit on the 2-heart challengers ends in one
good bonk. `validateBattleDefinition` rejects a `weakness` that is not
offerable — not in `availableActions` ∪ `offeredAbilities`
(`weakness-not-offered`), and winnability sums `damagePotential()` — the
engine's own matrix — over `maxRounds` on **base actions only**, so a
keepsake weakness can never be load-bearing.

## Quest keepsake abilities

Completing a quest grants its **battle ability** — a physical keepsake
object (`QuestDefinition.battleAbility`, one per quest, all 9 covered).
Nothing is persisted for this: at `START_BATTLE` the game reducer derives
the child's unlocked abilities from `state.quests` (status `completed`,
quest order) and intersects them with the opponent's authored
`offeredAbilities` — the earned subset joins `availableActions` on the
effective `BattleState.definition`. A child without the feared keepsake
still wins with ball and cushion; the keepsake is a reward, never a gate.

Every ability carries its own row in `OUTCOME_MATRIX` (`battle.ts`) — one
deterministic rule a child can learn:

| Ability          | Quest         | `rest`    | `attack`  | Extra                          |
| ---------------- | ------------- | --------- | --------- | ------------------------------ |
| `action-smile`   | greeting      | no-effect | hit       | kindness counter               |
| `action-basket`  | helping       | hit       | blocked   | always does something          |
| `action-leaf`    | tidying       | whiffed   | blocked   | soft guard                     |
| `action-friends` | finale        | hit       | whiffed   | **pacify**: next intent `rest` |
| `action-kite`    | park-kite     | hit       | hit       | always lands                   |
| `action-shell`   | river-shell   | whiffed   | hit       | dazzles mid-charge             |
| `action-bread`   | bread-errand  | no-effect | blocked   | **pacify**: snack break        |
| `action-book`    | school-answer | hit       | no-effect | calm scorer                    |
| `action-crystal` | cave-crystal  | hit       | whiffed   | **hits for 2**                 |

Pacify sets `BattleState.forcedIntent`, consumed once at the next
`roundCheck` — the opponent settles for exactly one round. The crystal's
bonus stacks with weakness (a feared crystal lands for 3).

UI/content contract: `BATTLE_ACTION_ELEMENT` maps each action to its
physical `SceneGlyph`; `BATTLE_ABILITY_COPY` (`content/fa/battles.ts`)
holds the name, unlock line, and per-outcome lines — the quest-celebration
card announces the keepsake (`celebration-ability`), and `promptFa` swaps
to the generic pick line once more than two objects are offered.
Validation pins quest→ability uniqueness/coverage
(`unknown-ability`/`duplicate-ability`/`unreachable-ability`) and copy
bidirectionality (`missing-ability-copy`/`orphan-ability-copy`).

## Content contract

- Rows live in `src/content/fa/battles.ts`: `BattleDefinition`
  (`battleId`, `opponentId`, `hearts`, `maxRounds`, `availableActions`,
  `offeredAbilities`, `weakness`, `enemyIntentPattern` — round N uses
  `pattern[(N-1) % len]`) plus a `BattleCopy` row (`introFa`, `promptFa`,
  `outcomeFa`, `intentFa`, `victoryFa`, `defeatFa`) and the
  `BATTLE_ABILITY_COPY` table.
- `validate:content` checks: unique ids, opponent is a real NPC, positive
  budgets, non-empty actions/pattern, definition↔copy bidirectionality,
  **winnability** (base actions only — an ability must never be
  load-bearing, since keepsakes may be unearned), quest→ability coverage
  and copy coverage, and the usual child-copy text rules.
  Definition-level rules live in `src/framework/modules/battle/validation.ts`
  (`validateBattleDefinition`); winnability reuses `enemyIntentFor`, so the
  pattern **cycles** — `[rest, attack]` over 6 rounds yields three scorable
  rounds, not one literal entry. `src/framework/modules/battle/reducer.ts`
  (`battleReducer` over `BattleState | null`) is the seam the game reducer
  delegates `START_BATTLE`/`CHOOSE_BATTLE_ACTION`/`ADVANCE_BATTLE_PHASE`/
  `LEAVE_BATTLE` to — same shape as the encounter delegation.
- The playful mouse (`npc-playful-mouse`) is the MVP opponent —
  `archetype: 'critter'`, rendered through the animal slot in
  `ChallengeWorld.tsx` (it moved to the Challenge Zone with the zone PR).
  Its pattern is all-`rest`: with 3 hearts in 3 rounds an `attack` round is
  mathematically unwinnable, so the first battle teaches the ball; the
  `attack`/`shield` rows stay in the model for future definitions. It fears
  the basket keepsake — earned from `quest-helping`, never required.
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

- Physical actions only — the soft ball, the cushion, and any earned
  keepsakes are tappable `SceneGlyph` objects (`BATTLE_ACTION_ELEMENT`),
  never an action-icon row. Ability rows read their lines from
  `BATTLE_ABILITY_COPY` instead of `ACTION_COPY`.
- Pictographic strip in the header (W7b): heart **pips** — filled hearts
  remain, emptied slots stay pale — and round **dots** (elapsed filled,
  current ringed, future hollow); never bare numerals. The leave button
  sits alongside; the opponent is a physical presence (`SceneGlyph 'mouse'`).
- Session-only badges on the victory card (W7b): `battleAchievements`
  derives 🏅 `won`, 💡 `found-the-fear` (the feared action landed
  effectively), and 🎯 `steady` (no whiffed/shrugged rounds) from the
  `rounds` log — presentation only, never persisted; the persisted
  first-win record is already `victoryDiscoveryId`/discoveries.
- Instrumentation (probe/dev only): `window.__worldBattleState` mirrors the
  live `BattleState`; `window.__worldBattleEvents` records one row per phase
  entry (`'phase@round'`, `'end'` on exit).
