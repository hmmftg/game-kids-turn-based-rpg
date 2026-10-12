import { damagePotential } from './battle.ts';
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
  if (
    definition.weakness !== undefined &&
    !definition.availableActions.includes(definition.weakness)
  ) {
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
