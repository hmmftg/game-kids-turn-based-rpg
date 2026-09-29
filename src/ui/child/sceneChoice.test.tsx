import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { EncounterState, IconId } from '../../domain/game/types.ts';
import { QUEST_DEFINITIONS, getQuestStep } from '../../domain/quests/definitions.ts';
import { applyChoice, advancePhase } from '../../domain/quests/encounter.ts';
import { EncounterPanel } from './EncounterPanel.tsx';
import { HELD_ITEM } from './SceneChoice.tsx';
import { contextForStep, sceneElementFor } from './contextInteraction.ts';

/**
 * Contextual-target regression: the semantic invariant is
 *   physical target → the correct existing CHOOSE action
 * — never the pixel look, never an icon label.
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

function panel(
  encounter: EncounterState,
  onChoose: (iconId: IconId, correct: boolean) => void = () => {},
) {
  return render(
    <EncounterPanel
      encounter={encounter}
      onAdvance={() => {}}
      onChoose={onChoose}
      onLeave={() => {}}
    />,
  );
}

describe('contextual targets (ContextInteraction)', () => {
  it('every encounter step exposes at least one concrete tappable target', () => {
    for (const quest of QUEST_DEFINITIONS) {
      for (let i = 0; i < quest.steps.length; i++) {
        const step = getQuestStep(quest.id, i)!;
        const mapped = step.choiceIconIds.filter((id) => sceneElementFor(id) !== null);
        expect(
          mapped.length,
          `${quest.id}/${step.id} should offer a physical object/place target`,
        ).toBeGreaterThanOrEqual(1);
        // the correct action must always be reachable via direct manipulation
        expect(
          sceneElementFor(step.correctIconId),
          `${quest.id}/${step.id} correct choice must be a physical target`,
        ).not.toBeNull();
      }
    }
  });

  it('exactly one object is the obvious primary target per step', () => {
    for (const quest of QUEST_DEFINITIONS) {
      for (let i = 0; i < quest.steps.length; i++) {
        const context = contextForStep(quest.id, i);
        const step = getQuestStep(quest.id, i)!;
        const primaries = context.objects.filter((o) => o.prominence === 'primary');
        expect(primaries, `${quest.id} step ${i} must have one obvious target`).toHaveLength(1);
        expect(primaries[0]!.iconId).toBe(step.correctIconId);
        expect(primaries[0]!.isCorrect).toBe(true);
        for (const o of context.objects.filter((x) => !x.isCorrect)) {
          expect(o.prominence).toBe('secondary');
        }
      }
    }
  });

  it('pick: tapping the leaf invokes the existing pick-up action', async () => {
    const user = userEvent.setup();
    const calls: { iconId: string; correct: boolean }[] = [];
    panel(choiceEncounter('quest-tidying', 0), (iconId, correct) =>
      calls.push({ iconId, correct }),
    );
    const leaf = screen.getByTestId('scene-icon-pick-up');
    expect(leaf.getAttribute('data-element')).toBe('leaf');
    await user.click(leaf);
    await new Promise((r) => setTimeout(r, 250));
    expect(calls).toEqual([{ iconId: 'icon-pick-up', correct: true }]);
  });

  it('wrong-target taps still invoke their existing (incorrect) action — gentle retry is preserved', async () => {
    const user = userEvent.setup();
    const calls: { iconId: string; correct: boolean }[] = [];
    panel(choiceEncounter('quest-tidying', 1), (iconId, correct) =>
      calls.push({ iconId, correct }),
    );
    // held leaf is shown for the place step
    expect(screen.getByTestId('scene-choice').querySelector('.scene-held')).toHaveAttribute(
      'data-held',
      'leaf',
    );
    // tap the bare ground → leave-ground (wrong but valid, still through CHOOSE)
    await user.click(screen.getByTestId('scene-icon-leave-ground'));
    await new Promise((r) => setTimeout(r, 250));
    expect(calls).toEqual([{ iconId: 'icon-leave-ground', correct: false }]);
  });

  it('place: tapping the bin invokes the existing action; held object is visible', async () => {
    const user = userEvent.setup();
    const calls: { iconId: string; correct: boolean }[] = [];
    panel(choiceEncounter('quest-tidying', 1), (iconId, correct) =>
      calls.push({ iconId, correct }),
    );
    await user.click(screen.getByTestId('scene-icon-basket-bin'));
    await new Promise((r) => setTimeout(r, 250));
    expect(calls).toEqual([{ iconId: 'icon-basket-bin', correct: true }]);
  });

  it('talk: the neighbour NPC is itself the tappable target for greet', async () => {
    const user = userEvent.setup();
    const calls: { iconId: string; correct: boolean }[] = [];
    panel(choiceEncounter('quest-greeting', 0), (iconId, correct) =>
      calls.push({ iconId, correct }),
    );
    const npc = screen.getByTestId('scene-icon-greet');
    expect(npc.getAttribute('data-element')).toBe('person');
    await user.click(npc);
    await new Promise((r) => setTimeout(r, 250));
    expect(calls).toEqual([{ iconId: 'icon-greet', correct: true }]);
  });

  it('a rapid double-tap commits the choice exactly once', async () => {
    const user = userEvent.setup();
    const calls: { iconId: string; correct: boolean }[] = [];
    panel(choiceEncounter('quest-tidying', 1), (iconId, correct) =>
      calls.push({ iconId, correct }),
    );
    const bin = screen.getByTestId('scene-icon-basket-bin');
    await user.click(bin);
    await user.click(bin);
    await new Promise((r) => setTimeout(r, 300));
    expect(calls).toEqual([{ iconId: 'icon-basket-bin', correct: true }]);
  });

  it('no action vocabulary on the child surface: no glyph row, unmapped choices are simply absent', () => {
    panel(choiceEncounter('quest-tidying', 0));
    // the glyph row is not part of the default child flow at all
    expect(screen.queryByTestId('choices')).toBeNull();
    // kick has no distinct physical target → not offered as a tappable thing
    expect(screen.queryByTestId('scene-icon-kick')).toBeNull();
    // only physical things remain: leaf (primary) + path back (escape)
    expect(screen.getByTestId('scene-icon-pick-up')).toBeTruthy();
    expect(screen.getByTestId('scene-icon-turn-back')).toBeTruthy();
  });

  it('integration: picking the leaf advances the real encounter into held-leaf + destination targets', async () => {
    const user = userEvent.setup();
    const choices: IconId[] = [];
    const encounter = choiceEncounter('quest-tidying', 0);
    panel(encounter, (iconId) => choices.push(iconId));
    await user.click(screen.getByTestId('scene-icon-pick-up'));
    await new Promise((r) => setTimeout(r, 250));
    expect(choices).toEqual(['icon-pick-up']);

    // Drive the real domain transitions: CHOOSE → response → reinforce →
    // next step's intro → demonstrate → playerChoice.
    const responded = applyChoice(encounter, 'icon-pick-up');
    const nextStep = advancePhase(advancePhase(advancePhase(advancePhase(responded))));
    expect(nextStep.phase).toBe('playerChoice');
    expect(nextStep.stepIndex).toBe(1);

    // The next state renders held leaf + destination targets — the wiring is
    // encounter-state-driven, not a model shortcut.
    panel(nextStep);
    const strip = screen.getAllByTestId('scene-choice')[1]!;
    expect(strip.querySelector('.scene-held')).toHaveAttribute('data-held', 'leaf');
    expect(screen.getByTestId('scene-icon-basket-bin').getAttribute('data-element')).toBe('bin');
    expect(screen.getByTestId('scene-icon-leave-ground').getAttribute('data-element')).toBe(
      'floor',
    );
  });

  it('consequence is truthful: it renders only on the response card, after a correct CHOOSE', () => {
    panel({
      ...choiceEncounter('quest-tidying', 0),
      phase: 'worldResponse',
      lastChoiceIconId: 'icon-pick-up',
      lastChoiceCorrect: true,
    });
    expect(document.querySelector('.scene-consequence')).toBeTruthy();
    // a wrong pick shows no success animation
    panel({
      ...choiceEncounter('quest-tidying', 0),
      phase: 'worldResponse',
      lastChoiceIconId: 'icon-turn-back',
      lastChoiceCorrect: false,
    });
    expect(document.querySelectorAll('.scene-consequence')).toHaveLength(1);
  });

  it('scene coverage is deterministic: held-item hints exist exactly for place-type steps', () => {
    for (const [iconId, item] of Object.entries(HELD_ITEM)) {
      expect(sceneElementFor(iconId as IconId)).not.toBeNull();
      expect(['leaf', 'basket']).toContain(item);
    }
  });
});
