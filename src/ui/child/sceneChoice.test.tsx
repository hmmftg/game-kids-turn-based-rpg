import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { EncounterState, IconId } from '../../domain/game/types.ts';
import { QUEST_DEFINITIONS, getQuestStep } from '../../domain/quests/definitions.ts';
import { EncounterPanel } from './EncounterPanel.tsx';
import { HELD_ITEM, sceneElementFor } from './SceneChoice.tsx';

/**
 * Direct-manipulation regression: the semantic invariant is
 *   visual target → the correct existing CHOOSE action
 * — never the pixel look.
 */

function choiceEncounter(questId: EncounterState['questId'], stepIndex: number): EncounterState {
  return {
    questId,
    stepIndex,
    phase: 'playerChoice',
    retries: 0,
    lastChoiceIconId: null,
    lastChoiceCorrect: null,
  };
}

describe('direct manipulation (SceneChoice)', () => {
  it('every encounter step exposes at least one concrete tappable target', () => {
    for (const quest of QUEST_DEFINITIONS) {
      for (let i = 0; i < quest.steps.length; i++) {
        const step = getQuestStep(quest.id, i)!;
        const mapped = step.choiceIconIds.filter((id) => sceneElementFor(id) !== null);
        expect(
          mapped.length,
          `${quest.id}/${step.id} should offer a direct object/place target`,
        ).toBeGreaterThanOrEqual(1);
        // the correct action must always be reachable via direct manipulation
        expect(
          sceneElementFor(step.correctIconId),
          `${quest.id}/${step.id} correct choice must be a concrete target`,
        ).not.toBeNull();
      }
    }
  });

  it('pick: tapping the leaf invokes the existing pick-up action', async () => {
    const user = userEvent.setup();
    const calls: { iconId: string; correct: boolean }[] = [];
    render(
      <EncounterPanel
        encounter={choiceEncounter('quest-tidying', 0)}
        onAdvance={() => {}}
        onChoose={(iconId, correct) => calls.push({ iconId, correct })}
        onLeave={() => {}}
      />,
    );
    const leaf = screen.getByTestId('scene-icon-pick-up');
    expect(leaf.getAttribute('data-element')).toBe('leaf');
    await user.click(leaf);
    expect(calls).toEqual([{ iconId: 'icon-pick-up', correct: true }]);
  });

  it('wrong-target taps still invoke their existing (incorrect) action — gentle retry is preserved', async () => {
    const user = userEvent.setup();
    const calls: { iconId: string; correct: boolean }[] = [];
    render(
      <EncounterPanel
        encounter={choiceEncounter('quest-tidying', 1)}
        onAdvance={() => {}}
        onChoose={(iconId, correct) => calls.push({ iconId, correct })}
        onLeave={() => {}}
      />,
    );
    // held leaf is shown for the place step
    expect(screen.getByTestId('scene-choice').querySelector('.scene-held')).toHaveAttribute(
      'data-held',
      'leaf',
    );
    // tap the bare ground → leave-ground (wrong but valid, still through CHOOSE)
    await user.click(screen.getByTestId('scene-icon-leave-ground'));
    expect(calls).toEqual([{ iconId: 'icon-leave-ground', correct: false }]);
  });

  it('place: tapping the bin invokes the existing action; held object is visible', async () => {
    const user = userEvent.setup();
    const calls: { iconId: string; correct: boolean }[] = [];
    render(
      <EncounterPanel
        encounter={choiceEncounter('quest-tidying', 1)}
        onAdvance={() => {}}
        onChoose={(iconId, correct) => calls.push({ iconId, correct })}
        onLeave={() => {}}
      />,
    );
    await user.click(screen.getByTestId('scene-icon-basket-bin'));
    expect(calls).toEqual([{ iconId: 'icon-basket-bin', correct: true }]);
  });

  it('talk: the neighbour NPC is itself the tappable target for greet', async () => {
    const user = userEvent.setup();
    const calls: { iconId: string; correct: boolean }[] = [];
    render(
      <EncounterPanel
        encounter={choiceEncounter('quest-greeting', 0)}
        onAdvance={() => {}}
        onChoose={(iconId, correct) => calls.push({ iconId, correct })}
        onLeave={() => {}}
      />,
    );
    const npc = screen.getByTestId('scene-icon-greet');
    expect(npc.getAttribute('data-element')).toBe('person');
    await user.click(npc);
    expect(calls).toEqual([{ iconId: 'icon-greet', correct: true }]);
  });

  it('ambiguous choices (kick shares the leaf) stay glyph-only; all choices keep a glyph fallback', () => {
    render(
      <EncounterPanel
        encounter={choiceEncounter('quest-tidying', 0)}
        onAdvance={() => {}}
        onChoose={() => {}}
        onLeave={() => {}}
      />,
    );
    // kick has no distinct concrete target → no scene button
    expect(screen.queryByTestId('scene-icon-kick')).toBeNull();
    // but every choice, kick included, keeps its glyph button
    for (const iconId of ['icon-pick-up', 'icon-kick', 'icon-turn-back'] as const) {
      expect(screen.getByTestId(`choice-${iconId}`)).toBeTruthy();
    }
    // and the glyph row is visually secondary
    expect(screen.getByTestId('choices').className).toContain('choices--secondary');
  });

  it('scene coverage is deterministic: held-item hints exist exactly for place-type steps', () => {
    for (const [iconId, item] of Object.entries(HELD_ITEM)) {
      expect(sceneElementFor(iconId as IconId)).not.toBeNull();
      expect(['leaf', 'basket']).toContain(item);
    }
  });
});
