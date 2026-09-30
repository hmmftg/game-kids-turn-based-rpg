import type { MouseEvent } from 'react';
import { getIcon } from '../../content/fa/icons.ts';
import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { getQuestStep } from '../../domain/quests/definitions.ts';
import type { EncounterState } from '../../domain/game/types.ts';
import { ActionGlyph } from './ActionGlyph.tsx';
import { DialogueCard } from './DialogueCard.tsx';
import { ConsequenceScene, SceneChoice, SceneGlyph } from './SceneChoice.tsx';
import { contextForStep, sceneElementFor } from './contextInteraction.ts';
import { usePacedAdvance } from './usePacedAdvance.ts';

/**
 * Turn-based encounter surface.
 *
 * Phases alternate world turn → child turn. Passive beats play themselves —
 * the child never taps to continue; the only mandatory action is the object
 * choice. Tapping a passive card skips ahead for a child who is ready; a
 * wrong pick is answered with a gentle re-demonstration automatically: no
 * failure, no shame, no blocked progress.
 */
export function EncounterPanel({
  encounter,
  hideCopy,
  onAdvance,
  onChoose,
  onLeave,
}: {
  readonly encounter: EncounterState;
  /** Mode-B kid test: no rendered copy; the question is a picture. */
  readonly hideCopy?: boolean | undefined;
  readonly onAdvance: () => void;
  readonly onChoose: (iconId: `icon-${string}`, correct: boolean) => void;
  readonly onLeave: () => void;
}) {
  const step = getQuestStep(encounter.questId, encounter.stepIndex);
  const copy = getQuestCopy(encounter.questId);
  const stepCopy = copy.steps[encounter.stepIndex];
  // Pacing decides WHEN to ask for the next state; the reducer stays the
  // source of truth. Fires only on passive phases — never during choice.
  const copyLength = (
    (stepCopy?.introFa ?? '') +
    (stepCopy?.demonstrateFa ?? '') +
    (stepCopy?.promptFa ?? '') +
    (stepCopy?.successFa ?? '')
  ).length;
  usePacedAdvance(encounter.phase, copyLength, onAdvance);
  if (!step || !stepCopy) return null;

  const leave = (
    <button
      type="button"
      className="btn btn--secondary"
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        onLeave();
      }}
      data-testid="leave-encounter"
    >
      {FA.backToHood}
    </button>
  );

  switch (encounter.phase) {
    case 'intro':
      return (
        <DialogueCard
          textFa={stepCopy.introFa}
          testId="encounter-intro"
          onTap={onAdvance}
          hideText={hideCopy}
        >
          {leave}
        </DialogueCard>
      );

    case 'demonstrate': {
      const cueIcon = getIcon(step.correctIconId);
      return (
        <DialogueCard
          textFa={stepCopy.demonstrateFa}
          testId="encounter-demonstrate"
          onTap={onAdvance}
          hideText={hideCopy}
        >
          <span
            className={`demo demo--${step.demonstrationCue}`}
            aria-hidden="true"
            data-cue={step.demonstrationCue}
          >
            <ActionGlyph iconId={step.correctIconId} size={56} color={cueIcon.color} animate />
          </span>
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
      // Mode B: the question is a picture — the asked thing in a ❓ frame.
      const askedElement = sceneElementFor(step.correctIconId);
      // Mode B: objects never pre-highlighted — the ❓ card is the only
      // question signal, so "what is asked" can't collapse into "what glows".
      const choiceObjects = hideCopy
        ? context.objects.map((object) =>
            object.role === 'escape' ? object : { ...object, prominence: 'secondary' as const },
          )
        : context.objects;
      return (
        <DialogueCard
          textFa={stepCopy.promptFa}
          testId="encounter-choice"
          hideText={hideCopy}
          scene={
            <>
              {hideCopy && askedElement !== null ? (
                <span className="scene-question" data-testid="scene-question" aria-hidden="true">
                  <SceneGlyph
                    element={askedElement}
                    size={76}
                    color={getIcon(step.correctIconId).color}
                  />
                  <span className="emoji scene-question__mark">❓</span>
                </span>
              ) : null}
              <SceneChoice
                objects={choiceObjects}
                held={context.held ?? undefined}
                onSelect={(iconId) => onChoose(iconId, iconId === step.correctIconId)}
              />
            </>
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
          hideText={hideCopy}
          onTap={onAdvance}
          scene={
            correct && encounter.lastChoiceIconId ? (
              <ConsequenceScene iconId={encounter.lastChoiceIconId} />
            ) : undefined
          }
        />
      );
    }

    case 'reinforce':
      return (
        <DialogueCard
          textFa={stepCopy.successFa}
          testId="encounter-reinforce"
          onTap={onAdvance}
          hideText={hideCopy}
        />
      );

    case 'complete':
      return (
        <DialogueCard
          textFa={copy.completionFa}
          testId="encounter-complete"
          onTap={onAdvance}
          hideText={hideCopy}
        />
      );
  }
}
