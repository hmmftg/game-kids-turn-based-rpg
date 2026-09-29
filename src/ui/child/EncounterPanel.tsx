import { getIcon } from '../../content/fa/icons.ts';
import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { getQuestStep } from '../../domain/quests/definitions.ts';
import type { EncounterState } from '../../domain/game/types.ts';
import { ActionGlyph } from './ActionGlyph.tsx';
import { DialogueCard } from './DialogueCard.tsx';
import { ConsequenceScene, SceneChoice } from './SceneChoice.tsx';
import { contextForStep } from './contextInteraction.ts';

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
      {FA.backToHood}
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

    case 'demonstrate': {
      const cueIcon = getIcon(step.correctIconId);
      return (
        <DialogueCard textFa={stepCopy.demonstrateFa} testId="encounter-demonstrate">
          <span
            className={`demo demo--${step.demonstrationCue}`}
            aria-hidden="true"
            data-cue={step.demonstrationCue}
          >
            <ActionGlyph iconId={step.correctIconId} size={56} color={cueIcon.color} animate />
          </span>
          {next(FA.next, 'advance-demonstrate')}
          {leave}
        </DialogueCard>
      );
    }

    case 'playerChoice': {
      // The contextual target layer IS the child-facing UI here: no action
      // vocabulary, no icon row. The ContextInteraction model says which
      // physical things are present and which one is the obvious target;
      // tapping any of them fires the existing CHOOSE(iconId). Choices with
      // no distinct concrete target are simply not offered.
      const context = contextForStep(encounter.questId, encounter.stepIndex);
      return (
        <DialogueCard
          textFa={stepCopy.promptFa}
          testId="encounter-choice"
          scene={
            <SceneChoice
              objects={context.objects}
              held={context.held ?? undefined}
              onSelect={(iconId) => onChoose(iconId, iconId === step.correctIconId)}
            />
          }
        >
          {leave}
        </DialogueCard>
      );
    }

    case 'worldResponse': {
      const correct = encounter.lastChoiceCorrect === true;
      return (
        <DialogueCard
          textFa={correct ? stepCopy.successFa : stepCopy.retryFa}
          testId="encounter-response"
          variant={correct ? undefined : 'retry'}
          scene={
            correct && encounter.lastChoiceIconId ? (
              <ConsequenceScene iconId={encounter.lastChoiceIconId} />
            ) : undefined
          }
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
