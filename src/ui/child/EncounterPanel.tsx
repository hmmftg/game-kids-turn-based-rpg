import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { getQuestStep } from '../../domain/quests/definitions.ts';
import type { EncounterState } from '../../domain/game/types.ts';
import { DialogueCard } from './DialogueCard.tsx';

/**
 * Turn-based encounter surface.
 *
 * Phases alternate world turn → child turn. A wrong pick is answered with a
 * gentle re-demonstration: no failure, no shame, no blocked progress.
 */
export function EncounterPanel({
  encounter,
  onAdvance,
  onChoose,
  onLeave,
}: {
  readonly encounter: EncounterState;
  readonly onAdvance: () => void;
  readonly onChoose: (iconId: `icon-${string}`, correct: boolean) => void;
  readonly onLeave: () => void;
}) {
  const step = getQuestStep(encounter.questId, encounter.stepIndex);
  const copy = getQuestCopy(encounter.questId);
  const stepCopy = copy.steps[encounter.stepIndex];
  if (!step || !stepCopy) return null;

  const leave = (
    <button
      type="button"
      className="btn btn--secondary"
      onClick={onLeave}
      data-testid="leave-encounter"
    >
      {FA.back}
    </button>
  );

  const next = (label: string, testId: string) => (
    <button type="button" className="btn" onClick={onAdvance} data-testid={testId}>
      {label}
    </button>
  );

  switch (encounter.phase) {
    case 'intro':
      return (
        <DialogueCard textFa={stepCopy.introFa} testId="encounter-intro">
          {next(FA.next, 'advance-intro')}
          {leave}
        </DialogueCard>
      );

    case 'demonstrate':
      return (
        <DialogueCard textFa={stepCopy.demonstrateFa} testId="encounter-demonstrate">
          <span className={`demo demo--${step.demonstrationCue}`} aria-hidden="true" />
          {next(FA.next, 'advance-demonstrate')}
          {leave}
        </DialogueCard>
      );

    case 'playerChoice':
      return (
        <DialogueCard
          textFa={stepCopy.promptFa}
          testId="encounter-choice"
          choices={step.choiceIconIds.map((iconId) => ({
            iconId,
            onSelect: () => onChoose(iconId, iconId === step.correctIconId),
          }))}
        >
          {leave}
        </DialogueCard>
      );

    case 'worldResponse': {
      const correct = encounter.lastChoiceCorrect === true;
      return (
        <DialogueCard
          textFa={correct ? stepCopy.successFa : stepCopy.retryFa}
          testId="encounter-response"
        >
          {next(correct ? FA.next : FA.watchAgain, correct ? 'advance-response' : 'retry-response')}
        </DialogueCard>
      );
    }

    case 'reinforce':
      return (
        <DialogueCard textFa={stepCopy.successFa} testId="encounter-reinforce">
          {next(FA.next, 'advance-reinforce')}
        </DialogueCard>
      );

    case 'complete':
      return (
        <DialogueCard textFa={copy.completionFa} testId="encounter-complete">
          {next(FA.next, 'advance-complete')}
        </DialogueCard>
      );
  }
}
