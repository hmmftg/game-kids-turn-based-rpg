import { damagePotential } from './battle.ts';
import { BASE_BATTLE_ACTION_IDS, BATTLE_ABILITY_IDS } from './types.ts';
import type { BattleDefinition } from './types.ts';

/**
 * Definition-level rules for authored battles — the domain half of
 * validate:content's `validateBattles` (which keeps the content-side checks:
 * duplicate ids, opponent/copy cross-references, copy lint).
 *
 * Winnability mirrors the engine exactly: intents for rounds `1..maxRounds`
 * come from `enemyIntentFor`, which cycles the authored pattern — so a
 * pattern like `[rest, attack]` over 6 rounds yields three scorable rest
 * rounds, not the one literal `rest` entry.
 */
export interface BattleDefinitionIssue {
  readonly code:
    | 'bad-battle-budget'
    | 'no-battle-actions'
    | 'empty-intent-pattern'
    | 'weakness-not-offered'
    | 'non-base-action'
    | 'offered-not-ability'
    | 'unwinnable-battle';
  readonly message: string;
}

export function validateBattleDefinition(definition: BattleDefinition): BattleDefinitionIssue[] {
  const issues: BattleDefinitionIssue[] = [];
  if (definition.hearts <= 0 || definition.maxRounds <= 0) {
    issues.push({
      code: 'bad-battle-budget',
      message: 'Battle hearts and maxRounds must be positive.',
    });
  }
  if (definition.availableActions.length === 0) {
    issues.push({ code: 'no-battle-actions', message: 'Battle offers the child no actions.' });
  }
  if (definition.enemyIntentPattern.length === 0) {
    issues.push({ code: 'empty-intent-pattern', message: 'Battle intent pattern is empty.' });
  }
  // `availableActions` is the always-held base set — abilities belong in
  // `offeredAbilities` so the quest gate applies and winnability below is
  // proven on base actions alone.
  for (const action of definition.availableActions) {
    if (!(BASE_BATTLE_ACTION_IDS as readonly string[]).includes(action)) {
      issues.push({
        code: 'non-base-action',
        message: `availableActions entry ${action} is not a base action; abilities belong in offeredAbilities.`,
      });
    }
  }
  const offeredAbilities = definition.offeredAbilities ?? [];
  for (const ability of offeredAbilities) {
    if (!(BATTLE_ABILITY_IDS as readonly string[]).includes(ability)) {
      issues.push({
        code: 'offered-not-ability',
        message: `offeredAbilities entry ${ability} is not a quest-granted ability.`,
      });
    }
  }
  // The feared action must be one the child can actually be offered — a base
  // action, or an ability this opponent notices. An ability weakness reaches
  // the child only once its quest is complete; until then the battle plays
  // with plain outcomes (winnability below never depends on it).
  const offerable = [...definition.availableActions, ...offeredAbilities];
  if (definition.weakness !== undefined && !offerable.includes(definition.weakness)) {
    issues.push({
      code: 'weakness-not-offered',
      message: `Battle weakness ${definition.weakness} is not among the child's offered actions.`,
    });
  }
  if (issues.length > 0) return issues;
  // Scorable is the best heart damage the child can deal each round — the
  // engine's own matrix (weakness included) decides, not a literal count.
  let scorable = 0;
  for (let round = 1; round <= definition.maxRounds; round += 1) {
    scorable += damagePotential(definition, round);
  }
  if (scorable < definition.hearts) {
    issues.push({
      code: 'unwinnable-battle',
      message: `Battle cannot be won: at most ${scorable} hearts of damage within ${definition.maxRounds} rounds but ${definition.hearts} hearts to take.`,
    });
  }
  return issues;
}
