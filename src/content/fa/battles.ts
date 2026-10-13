import type { BattleAbilityId, BattleDefinition, BattleOutcome } from '../../framework/index.ts';
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
 * the framework battle module (`src/framework/modules/battle/battle.ts`); a row names the opponent NPC, the heart and
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
    // Quest abilities the mouse notices once earned: the basket and the
    // book both reach a resting opponent. The mouse is scared of the
    // basket — a landed basket bonk costs it two hearts.
    offeredAbilities: ['action-basket', 'action-book'],
    weakness: 'action-basket',
  },
  // Challenge Zone opponents: same machine, same actions — 3 rounds is the
  // hard maximum and hearts are a per-opponent authored budget ≤3, so each
  // challenger gets a different deterministic rhythm (2 hearts means one
  // `attack` round fits inside the budget and the battle stays winnable).
  // Each carries a `victoryDiscoveryId`: winning records the world fact
  // that drives the opponent's happy/resting presentation and opens a
  // gated path. Each also fears one quest keepsake — a feared ability
  // landing for two hearts ends the challenger in one good bonk.
  {
    battleId: 'battle-challenge-bird',
    opponentId: 'npc-challenge-bird',
    hearts: 2,
    maxRounds: 3,
    availableActions: ['action-ball', 'action-shield'],
    // The bird envies the flying kite; the shiny shell dazzles it mid-charge.
    offeredAbilities: ['action-kite', 'action-shell'],
    enemyIntentPattern: ['rest', 'attack', 'rest'],
    weakness: 'action-kite',
    victoryDiscoveryId: 'discovery-challenge-bird',
  },
  {
    battleId: 'battle-challenge-eagle',
    opponentId: 'npc-challenge-eagle',
    hearts: 2,
    maxRounds: 3,
    availableActions: ['action-ball', 'action-shield'],
    // The proud eagle respects the shiny crystal; a shared snack settles it.
    offeredAbilities: ['action-crystal', 'action-bread'],
    enemyIntentPattern: ['attack', 'rest', 'rest'],
    weakness: 'action-crystal',
    victoryDiscoveryId: 'discovery-challenge-eagle',
  },
  {
    battleId: 'battle-challenge-butterfly',
    opponentId: 'npc-challenge-butterfly',
    hearts: 2,
    maxRounds: 3,
    availableActions: ['action-ball', 'action-shield'],
    // The butterfly loses its heart to the shiny shell; a smile disarms it too.
    offeredAbilities: ['action-shell', 'action-smile'],
    enemyIntentPattern: ['rest', 'rest', 'attack'],
    weakness: 'action-shell',
    victoryDiscoveryId: 'discovery-challenge-butterfly',
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
  {
    battleId: 'battle-challenge-bird',
    introFa: 'پرنده‌ی چالش بازی می‌خواهد.',
    promptFa: 'توپ یا بالش؟',
    outcomeFa: {
      'opponent-hit': 'توپ نرم به پرنده رسید!',
      blocked: 'بالش جلوی بازی را گرفت.',
      whiffed: 'توپ از کنار پرنده رد شد.',
      'no-effect': 'پرنده فقط نگاه کرد.',
    },
    intentFa: {
      rest: 'پرنده روی تکیه‌گاهش صبر می‌کند.',
      attack: 'پرنده به سمت توپ پرواز می‌کند!',
    },
    victoryFa: 'هورا! پرنده خوشحال شد و راه را نشان داد.',
    defeatFa: 'پرنده این دور برد. باز هم بازی؟',
    review: DRAFT_REVIEW,
  },
  {
    battleId: 'battle-challenge-eagle',
    introFa: 'عقاب چالش با غرور بازی می‌خواهد.',
    promptFa: 'توپ یا بالش؟',
    outcomeFa: {
      'opponent-hit': 'توپ نرم به عقاب رسید!',
      blocked: 'بالش جلوی بازی را گرفت.',
      whiffed: 'توپ از کنار عقاب رد شد.',
      'no-effect': 'عقاب فقط نگاه کرد.',
    },
    intentFa: {
      rest: 'عقاب آرام نشسته و نگاه می‌کند.',
      attack: 'عقاب به سمت توپ پرواز می‌کند!',
    },
    victoryFa: 'هورا! عقاب لبخند زد و پل باز شد.',
    defeatFa: 'عقاب این دور برد. باز هم بازی؟',
    review: DRAFT_REVIEW,
  },
  {
    battleId: 'battle-challenge-butterfly',
    introFa: 'پروانه‌ی چالش بازی می‌خواهد.',
    promptFa: 'توپ یا بالش؟',
    outcomeFa: {
      'opponent-hit': 'توپ نرم به پروانه رسید!',
      blocked: 'بالش جلوی بازی را گرفت.',
      whiffed: 'توپ از کنار پروانه رد شد.',
      'no-effect': 'پروانه فقط نگاه کرد.',
    },
    intentFa: {
      rest: 'پروانه کنار گل آرام است.',
      attack: 'پروانه دور توپ می‌چرخد!',
    },
    victoryFa: 'هورا! پروانه شاد شد و راه نشان داد.',
    defeatFa: 'پروانه این دور برد. باز هم بازی؟',
    review: DRAFT_REVIEW,
  },
];

/**
 * Child-facing copy for one quest-granted ability — a name for the unlock
 * line and one short line per outcome the ability can produce. Abilities
 * without a line for an outcome fall back to the battle's own `outcomeFa`.
 */
export interface BattleAbilityCopy {
  readonly action: BattleAbilityId;
  readonly nameFa: string;
  /** Celebration line when the granting quest completes. */
  readonly unlockFa: string;
  readonly outcomeFa: Partial<Record<BattleOutcome, string>>;
  readonly review: ReviewMetadata;
}

export const BATTLE_ABILITY_COPY: readonly BattleAbilityCopy[] = [
  {
    action: 'action-smile',
    nameFa: 'لبخند',
    unlockFa: 'لبخندت حالا در بازی‌ها هم کمکت می‌کند.',
    outcomeFa: {
      'opponent-hit': 'لبخندت کارساز شد!',
      'no-effect': 'فقط لبخندی رد و بدل شد.',
    },
    review: DRAFT_REVIEW,
  },
  {
    action: 'action-basket',
    nameFa: 'سبد',
    unlockFa: 'سبدت حالا در بازی‌ها هم با توست.',
    outcomeFa: {
      'opponent-hit': 'سبد کمک رسید!',
      blocked: 'سبد جلوی بازی را گرفت.',
    },
    review: DRAFT_REVIEW,
  },
  {
    action: 'action-leaf',
    nameFa: 'برگ',
    unlockFa: 'برگت حالا در بازی‌ها هم با توست.',
    outcomeFa: {
      whiffed: 'برگ آرام زمین نشست.',
      blocked: 'برگ نرم بازی را نرم کرد.',
    },
    review: DRAFT_REVIEW,
  },
  {
    action: 'action-friends',
    nameFa: 'دوستان',
    unlockFa: 'دوستانت حالا در بازی‌ها هم کنارت‌اند.',
    outcomeFa: {
      'opponent-hit': 'دوستانت رسیدند!',
      whiffed: 'دوستان کنار ماندند.',
    },
    review: DRAFT_REVIEW,
  },
  {
    action: 'action-kite',
    nameFa: 'بادبادک',
    unlockFa: 'بادبادکت حالا در بازی‌ها هم با توست.',
    outcomeFa: {
      'opponent-hit': 'بادبادک رسید!',
    },
    review: DRAFT_REVIEW,
  },
  {
    action: 'action-shell',
    nameFa: 'صدف',
    unlockFa: 'صدفت حالا در بازی‌ها هم با توست.',
    outcomeFa: {
      whiffed: 'صدف آرام بود.',
      'opponent-hit': 'درخشش صدف رسید!',
    },
    review: DRAFT_REVIEW,
  },
  {
    action: 'action-bread',
    nameFa: 'نان',
    unlockFa: 'نانت حالا در بازی‌ها هم با توست.',
    outcomeFa: {
      'no-effect': 'نان فقط بوی خوب داد.',
      blocked: 'برای نان ایستاد!',
    },
    review: DRAFT_REVIEW,
  },
  {
    action: 'action-book',
    nameFa: 'کتاب',
    unlockFa: 'کتابت حالا در بازی‌ها هم با توست.',
    outcomeFa: {
      'opponent-hit': 'کتاب جواب را گفت!',
      'no-effect': 'کتاب حالا لازم نبود.',
    },
    review: DRAFT_REVIEW,
  },
  {
    action: 'action-crystal',
    nameFa: 'بلور',
    unlockFa: 'بلورت حالا در بازی‌ها هم با توست.',
    outcomeFa: {
      'opponent-hit': 'بلور درخشید!',
      whiffed: 'بلور از کنارش گذشت.',
    },
    review: DRAFT_REVIEW,
  },
];

/** Copy row for one quest-granted ability, if authored. */
export function abilityCopyFor(action: string): BattleAbilityCopy | null {
  return BATTLE_ABILITY_COPY.find((copy) => copy.action === action) ?? null;
}

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
