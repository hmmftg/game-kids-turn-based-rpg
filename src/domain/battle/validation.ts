import { validateLightweightEncounter } from 'waypoint-rpg-gameplay';
import { BASE_BATTLE_ACTION_IDS, BATTLE_ABILITY_IDS } from './types.ts';
import type { BattleDefinition } from './types.ts';
import { toGameplayDefinition } from './adapter.ts';

export interface BattleDefinitionIssue {
  readonly code: string;
  readonly message: string;
}

/** Child-action authoring policy plus the generic package's data validation. */
export function validateBattleDefinition(definition: BattleDefinition): BattleDefinitionIssue[] {
  const issues: BattleDefinitionIssue[] = [];
  if (definition.availableActions.length === 0)
    issues.push({ code: 'no-battle-actions', message: 'Battle offers the child no actions.' });
  for (const action of definition.availableActions) {
    if (!(BASE_BATTLE_ACTION_IDS as readonly string[]).includes(action)) {
      issues.push({
        code: 'non-base-action',
        message: `availableActions entry ${action} is not a base action; abilities belong in offeredAbilities.`,
      });
    }
  }
  for (const ability of definition.offeredAbilities ?? []) {
    if (!(BATTLE_ABILITY_IDS as readonly string[]).includes(ability)) {
      issues.push({
        code: 'offered-not-ability',
        message: `offeredAbilities entry ${ability} is not a quest-granted ability.`,
      });
    }
  }
  const report = validateLightweightEncounter(toGameplayDefinition(definition));
  for (const diagnostic of report.diagnostics) {
    issues.push({
      code: diagnostic.code,
      message: `${diagnostic.path}: ${diagnostic.message}`,
    });
  }
  return issues;
}
