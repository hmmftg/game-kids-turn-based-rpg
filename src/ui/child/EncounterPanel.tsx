import type { MouseEvent } from 'react';
import { getIcon } from '../../content/fa/icons.ts';
import { getQuestCopy } from '../../content/fa/quests.ts';
import { FA } from '../../content/fa/strings.ts';
import { getQuestStep } from '../../domain/quests/definitions.ts';
import type { EncounterState } from '../../domain/game/types.ts';
import { DialogueCard } from './DialogueCard.tsx';
import {
  ConsequenceScene,
  DemoScene,
  QuestioningReact,
  SceneChoice,
  SceneGlyph,
} from './SceneChoice.tsx';
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
  hideActionIcons = false,
  onAdvance,
  onChoose,
  onLeave,
}: {
  readonly encounter: EncounterState;
  /** Mode-B kid test: no rendered copy; the question is a picture. */
  readonly hideCopy?: boolean | undefined;
  /** Mode noactionicons: remove every non-physical action affordance. */
  readonly hideActionIcons?: boolean | undefined;
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
          key="intro"
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
      const element = sceneElementFor(step.correctIconId);
      return (
        <DialogueCard
          key="demonstrate"
          textFa={stepCopy.demonstrateFa}
          testId="encounter-demonstrate"
          onTap={onAdvance}
          hideText={hideCopy}
        >
          {element !== null ? (
            <DemoScene cue={step.demonstrationCue} element={element} color={cueIcon.color} />
          ) : null}
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
      const choiceObjects = context.objects
        // Mode noactionicons: directional arrows are removed outright —
        // outside-tap is still the free escape. Physical distractors stay.
        .filter(
          (object) =>
            !hideActionIcons ||
            (object.element !== 'path-back' &&
              object.element !== 'path-forward' &&
              object.element !== 'person-away'),
        )
        .map((object) =>
          hideCopy && object.role !== 'escape'
            ? { ...object, prominence: 'secondary' as const }
            : object,
        );
      return (
        <DialogueCard
          key="playerChoice"
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
                  {hideActionIcons ? null : <span className="emoji scene-question__mark">❓</span>}
                </span>
              ) : null}
              <SceneChoice
                objects={choiceObjects}
                held={context.held ?? undefined}
                plainHeld={hideActionIcons}
                bareTargets={hideActionIcons}
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
          key="worldResponse"
          textFa={correct ? stepCopy.successFa : stepCopy.retryFa}
          testId="encounter-response"
          variant={correct ? undefined : 'retry'}
          hideText={hideCopy}
          onTap={onAdvance}
          scene={
            correct && encounter.lastChoiceIconId ? (
              <ConsequenceScene iconId={encounter.lastChoiceIconId} />
            ) : (
              <QuestioningReact actorId={step.npcId} />
            )
          }
        />
      );
    }

    case 'reinforce':
      // The step-win beat: the consequence rests at its destination — the
      // persistent "after" the child just caused (shell is IN the basket
      // now) — instead of re-showing the same card with nothing new.
      return (
        <DialogueCard
          key="reinforce"
          textFa={stepCopy.successFa}
          testId="encounter-reinforce"
          onTap={onAdvance}
          hideText={hideCopy}
          scene={
            encounter.lastChoiceIconId ? (
              <ConsequenceScene iconId={encounter.lastChoiceIconId} settled />
            ) : undefined
          }
        />
      );

    case 'complete':
      return (
        <DialogueCard
          key="complete"
          textFa={copy.completionFa}
          testId="encounter-complete"
          onTap={onAdvance}
          hideText={hideCopy}
        />
      );
  }
}
