import type { BattleDefinition, BattleOutcome } from '../../domain/battle/types.ts';
import type { ReviewMetadata } from '../types.ts';

const DRAFT_REVIEW: ReviewMetadata = {
  status: 'draft',
  scholarReviewer: '',
  childEditorReviewer: '',
  persianProofreader: '',
  reviewedAt: '',
  revisionNotes: 'پیش‌نویس داخلی؛ بدون ادعای دینی و بدون ارجاع.',
};

/**
 * Micro battle definitions — authored rows only. Rules live in
 * `src/domain/battle/battle.ts`; a row names the opponent NPC, the heart and
 * round budget, the child's physical actions, and the deterministic intent
 * pattern the opponent cycles through (round 1 uses pattern[0]).
 */
export const BATTLE_DEFINITIONS: readonly BattleDefinition[] = [
  {
    battleId: 'battle-playful-mouse',
    opponentId: 'npc-playful-mouse',
    hearts: 3,
    maxRounds: 3,
    availableActions: ['action-ball', 'action-shield'],
    // Always at rest: with 3 hearts in a 3-round budget an `attack` round is
    // mathematically unwinnable (max 2 scorable hits), so the first micro
    // battle keeps the mouse resting — ball taps score, cushion taps harmlessly
    // do nothing. `attack` rows stay in the model for future definitions.
    enemyIntentPattern: ['rest', 'rest', 'rest'],
  },
];

/** Child-facing copy for one battle — short iconic lines, like dialogue. */
export interface BattleCopy {
  readonly battleId: string;
  readonly introFa: string;
  readonly promptFa: string;
  readonly outcomeFa: Readonly<Record<BattleOutcome, string>>;
  /** One short line per enemy intent — the opponent's beat. */
  readonly intentFa: Readonly<Record<'rest' | 'attack', string>>;
  readonly victoryFa: string;
  readonly defeatFa: string;
  readonly review: ReviewMetadata;
}

export const BATTLE_COPY: readonly BattleCopy[] = [
  {
    battleId: 'battle-playful-mouse',
    introFa: 'موش بازیگوش بازی می‌خواهد.',
    promptFa: 'توپ یا بالش؟',
    outcomeFa: {
      'opponent-hit': 'توپ نرم به موش رسید!',
      blocked: 'بالش جلوی بازی را گرفت.',
      whiffed: 'توپ از کنار موش رد شد.',
      'no-effect': 'موش فقط نگاه کرد.',
    },
    intentFa: {
      rest: 'موش صبر می‌کند و نگاه می‌کند.',
      attack: 'موش به سمت توپ می‌دود!',
    },
    victoryFa: 'هورا! بازی را بردی.',
    defeatFa: 'موش این دور برد. باز هم بازی؟',
    review: DRAFT_REVIEW,
  },
];

export function getBattleDefinition(battleId: string): BattleDefinition | null {
  return BATTLE_DEFINITIONS.find((definition) => definition.battleId === battleId) ?? null;
}

export function getBattleCopy(battleId: string): BattleCopy | null {
  return BATTLE_COPY.find((copy) => copy.battleId === battleId) ?? null;
}

/** The battle a tap on this NPC figure starts, if any. */
export function battleForOpponent(npcId: string): BattleDefinition | null {
  return BATTLE_DEFINITIONS.find((definition) => definition.opponentId === npcId) ?? null;
}
