import type {
  LightweightEncounterState,
  LightweightEncounterOutcomeDefinition,
} from 'waypoint-rpg-gameplay';
import type { DiscoveryId, NpcId } from '../../framework/index.ts';

/** Mahalle-owned physical actions and authored outcomes for its child experience. */
export const BASE_BATTLE_ACTION_IDS = ['action-ball', 'action-shield'] as const;
export const BATTLE_ABILITY_IDS = [
  'action-smile',
  'action-basket',
  'action-leaf',
  'action-friends',
  'action-kite',
  'action-shell',
  'action-bread',
  'action-book',
  'action-crystal',
] as const;
export const BATTLE_ACTION_IDS = [...BASE_BATTLE_ACTION_IDS, ...BATTLE_ABILITY_IDS] as const;
export const BATTLE_PHASES = [
  'intro',
  'playerChoice',
  'playerResolution',
  'enemyResolution',
  'roundCheck',
  'victory',
  'defeat',
] as const;

export type BattleActionId = (typeof BATTLE_ACTION_IDS)[number];
export type BattleAbilityId = (typeof BATTLE_ABILITY_IDS)[number];
export type BattleIntent = 'rest' | 'attack';
export type BattleOutcome = 'opponent-hit' | 'blocked' | 'whiffed' | 'no-effect';
export type BattlePhase = (typeof BATTLE_PHASES)[number];
export type BattleAchievementId = 'won' | 'found-the-fear' | 'steady';

export interface BattleDefinition {
  readonly battleId: `battle-${string}`;
  readonly opponentId: NpcId;
  readonly hearts: number;
  readonly maxRounds: number;
  readonly availableActions: readonly BattleActionId[];
  readonly offeredAbilities?: readonly BattleActionId[];
  readonly enemyIntentPattern: readonly BattleIntent[];
  readonly weakness?: BattleActionId;
  readonly victoryDiscoveryId?: DiscoveryId;
  /** Authored game-specific consequence rows consumed by the generic engine. */
  readonly outcomes: readonly LightweightEncounterOutcomeDefinition[];
}

/** The package state is the only authoritative session battle state. */
export type BattleState = LightweightEncounterState;

export interface BattleRound {
  readonly action: BattleActionId;
  readonly outcome: BattleOutcome;
}

/** Presentation-only projection preserving the child UI's established names. */
export interface BattleView {
  readonly engine: BattleState;
  readonly definition: Omit<BattleDefinition, 'availableActions'> & {
    readonly availableActions: readonly BattleActionId[];
  };
  readonly battleId: BattleState['battleId'];
  readonly opponentId: BattleState['opponentId'];
  readonly phase: BattleState['phase'];
  readonly round: BattleState['round'];
  readonly playerHearts: BattleState['playerHearts'];
  readonly opponentHearts: BattleState['opponentHearts'];
  readonly enemyIntent: BattleIntent;
  readonly lastAction: BattleActionId | null;
  readonly lastOutcome: BattleOutcome | null;
  readonly rounds: readonly BattleRound[];
}
