import type { NpcId } from '../game/types.ts';
import type { DiscoveryId } from '../world/types.ts';

/**
 * Micro turn-based battle — the standalone toy contract (PR I).
 *
 * Pure data: 1v1, a few hearts each, a small number of player rounds,
 * exactly one child action per round, deterministic enemy intent. No React,
 * Three.js, DOM, timers, audio or persistence — `BattleState` is session-only
 * and lives on `GameState.battle` (never persisted, never a Mode).
 *
 * The state machine:
 *
 *   intro → playerChoice → playerResolution → enemyResolution → roundCheck
 *         → playerChoice | victory | defeat
 *
 * `playerChoice` waits for the child action; the other middle phases
 * auto-advance. `victory`/`defeat` are TERMINAL battle states — no further
 * automatic phase transition, `LEAVE_BATTLE` is the only exit.
 */
export const BATTLE_PHASES = [
  'intro',
  'playerChoice',
  'playerResolution',
  'enemyResolution',
  'roundCheck',
  'victory',
  'defeat',
] as const;

export type BattlePhase = (typeof BATTLE_PHASES)[number];

/**
 * The child's physical actions: the soft ball and the cushion (shield).
 * Physical objects only — no action vocabulary on the child surface.
 */
export const BATTLE_ACTION_IDS = ['action-ball', 'action-shield'] as const;

export type BattleActionId = (typeof BATTLE_ACTION_IDS)[number];

/** What the opponent intends this round — deterministic, authored on the definition. */
export type BattleIntent = 'rest' | 'attack';

/** The deterministic consequence of one child action against the intent. */
export type BattleOutcome = 'opponent-hit' | 'blocked' | 'whiffed' | 'no-effect';

export interface BattleState {
  /** The authored row that started the battle — plain serializable data. */
  readonly definition: BattleDefinition;
  readonly battleId: `battle-${string}`;
  readonly opponentId: NpcId;
  readonly phase: BattlePhase;
  /** Current player round (1-based). */
  readonly round: number;
  readonly playerHearts: number;
  readonly opponentHearts: number;
  /** The intent the opponent commits to for the current round. */
  readonly enemyIntent: BattleIntent;
  readonly lastAction: BattleActionId | null;
  readonly lastOutcome: BattleOutcome | null;
}

/**
 * Authored battle content (a row in `content/fa/battles.ts`): which NPC is the
 * opponent, the heart/round budget, the actions the child gets, and the fixed
 * intent pattern the opponent cycles through. Rules stay in the domain;
 * definitions are content and get authoring checks in validate:content.
 */
export interface BattleDefinition {
  readonly battleId: `battle-${string}`;
  readonly opponentId: NpcId;
  readonly hearts: number;
  readonly maxRounds: number;
  readonly availableActions: readonly BattleActionId[];
  readonly enemyIntentPattern: readonly BattleIntent[];
  /**
   * World fact recorded once when the child leaves a *victorious* battle —
   * the "world remembers the challenge was solved" primitive behind
   * post-victory presentation and gated paths. Optional: battles without it
   * (the existing playful mouse) persist nothing on victory. Must reference
   * `DISCOVERY_IDS`.
   */
  readonly victoryDiscoveryId?: DiscoveryId;
}
