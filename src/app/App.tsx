import { useCallback, useRef } from 'react';
import { DIALOGUE_NODES, getDialogueNode } from '../content/fa/dialogue.ts';
import { getNpcCopy, getQuestCopy } from '../content/fa/quests.ts';
import { FA } from '../content/fa/strings.ts';
import { selectCompletedQuestCount, selectQuestStatuses } from '../domain/game/selectors.ts';
import type { AnchorId, IconId, QuestId } from '../domain/game/types.ts';
import { getQuestDefinition, QUEST_DEFINITIONS } from '../domain/quests/definitions.ts';
import { canStartQuest } from '../domain/quests/prerequisites.ts';
import { DialogueCard } from '../ui/child/DialogueCard.tsx';
import { EncounterPanel } from '../ui/child/EncounterPanel.tsx';
import { PauseMenu } from '../ui/child/PauseMenu.tsx';
import { QuestTrail, StickerShelf } from '../ui/child/QuestTrail.tsx';
import {
  AvatarSelectScreen,
  ErrorScreen,
  LoadingScreen,
  OrientationScreen,
  TitleScreen,
  WebglFallbackScreen,
} from '../ui/child/screens.tsx';
import { ParentArea } from '../ui/parent/ParentArea.tsx';
import { ParentGate } from '../ui/parent/ParentGate.tsx';
import { WorldCanvas } from '../world/WorldCanvas.tsx';
import type { HubHandle } from '../world/Hub.tsx';
import { anchorForNpc, getAnchorOrNull } from '../world/navigation/graph.ts';
import { useGame } from './gameContext.ts';

function nodeForQuest(questId: QuestId): string | null {
  return DIALOGUE_NODES.find((node) => node.offersQuestId === questId)?.id ?? null;
}

function nodeForAnchor(anchor: AnchorId): string | null {
  const npcId = getAnchorOrNull(anchor)?.npcId ?? null;
  if (npcId === null) return null;
  return DIALOGUE_NODES.find((node) => node.npcId === npcId)?.id ?? null;
}

export function App() {
  const { state, dispatch, cacheStatus, updateReady, applyUpdate, resetProgress, playSfx } =
    useGame();
  const hubRef = useRef<HubHandle>(null);
  const statuses = selectQuestStatuses(state);
  const completed = selectCompletedQuestCount(state);

  const openNpc = useCallback(
    (nodeId: string | null) => {
      if (nodeId === null) return;
      const node = getDialogueNode(nodeId);
      if (!node) return;
      dispatch({ type: 'OPEN_DIALOGUE', npcId: node.npcId, nodeId: node.id });
    },
    [dispatch],
  );

  const onArrive = useCallback((anchor: AnchorId) => openNpc(nodeForAnchor(anchor)), [openNpc]);

  const goToQuest = useCallback(
    (questId: QuestId) => {
      const definition = getQuestDefinition(questId);
      const anchor = anchorForNpc(definition.steps[0]?.npcId ?? 'npc-elder');
      const open = () => openNpc(nodeForQuest(questId));
      // The avatar walks to the landmark first and the dialogue opens on
      // arrival; without a walker (no WebGL) the dialogue opens directly.
      if (!anchor || !hubRef.current?.goTo(anchor.id, open)) open();
    },
    [openNpc],
  );

  switch (state.mode) {
    case 'boot':
      return <LoadingScreen />;

    case 'orientationBlocked':
      return <OrientationScreen />;

    case 'fatalFallback':
      return <ErrorScreen reason={state.fatalReason} onRestart={resetProgress} />;

    case 'title':
      return (
        <TitleScreen
          hasProgress={state.avatarId !== null}
          notice={state.corruptSaveDetected ? FA.corruptSave : null}
          onStart={() => {
            playSfx('sfx-choice');
            dispatch({ type: 'START_PRESSED' });
          }}
          onParent={() => dispatch({ type: 'OPEN_PARENT_GATE' })}
        />
      );

    case 'avatarSelect':
      return (
        <AvatarSelectScreen
          onSelect={(avatarId) => {
            playSfx('sfx-choice');
            dispatch({ type: 'SELECT_AVATAR', avatarId });
          }}
        />
      );

    case 'parentGate':
      return (
        <ParentGate
          onPass={() => dispatch({ type: 'PARENT_GATE_PASSED' })}
          onCancel={() => dispatch({ type: 'CLOSE_PARENT' })}
        />
      );

    case 'parentArea':
      return (
        <ParentArea
          state={state}
          cacheStatus={cacheStatus}
          onClose={() => dispatch({ type: 'CLOSE_PARENT' })}
          onReset={resetProgress}
        />
      );

    case 'paused':
      return (
        <PauseMenu
          audio={state.audio}
          qualityTier={state.qualityTier}
          updateReady={updateReady}
          onResume={() => dispatch({ type: 'RESUME' })}
          onAudioChange={(audio) => dispatch({ type: 'SET_AUDIO_SETTINGS', audio })}
          onQualityChange={(tier) => dispatch({ type: 'SET_QUALITY_TIER', tier })}
          onParentArea={() => dispatch({ type: 'OPEN_PARENT_GATE' })}
          onApplyUpdate={applyUpdate}
        />
      );

    default:
      break;
  }

  if (state.avatarId === null) return <LoadingScreen />;

  const dialogueNode = state.dialogue ? getDialogueNode(state.dialogue.nodeId) : null;
  const offeredQuest = dialogueNode?.offersQuestId ?? null;
  // First unfinished chapter — the big fallback button continues progress
  // instead of always reopening the greeting quest.
  const continueQuestId =
    QUEST_DEFINITIONS.find((quest) => {
      const status = statuses[quest.id];
      return status === 'available' || status === 'active';
    })?.id ?? 'quest-greeting';

  return (
    <div className="hud" data-testid="hud">
      {state.webglAvailable ? (
        <WorldCanvas
          avatarId={state.avatarId}
          questStatuses={statuses}
          completedCount={completed}
          interactive={state.mode === 'hub'}
          qualityTier={state.qualityTier}
          onArrive={onArrive}
          onContextLost={() => dispatch({ type: 'WEBGL_AVAILABILITY_CHANGED', available: false })}
          handleRef={hubRef}
        />
      ) : null}

      <div className="hud__top">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => dispatch({ type: 'PAUSE' })}
          data-testid="pause-button"
        >
          {FA.pause}
        </button>
        <StickerShelf stickers={state.stickers} />
      </div>

      <div className="hud__side">
        <QuestTrail statuses={statuses} onGo={goToQuest} />
      </div>

      <div className="hud__bottom">
        {state.mode === 'dialogue' && dialogueNode ? (
          <DialogueCard
            speakerFa={getNpcCopy(dialogueNode.npcId)?.nameFa}
            textFa={dialogueNode.textFa}
            testId="npc-dialogue"
          >
            {offeredQuest && canStartQuest(state, offeredQuest) ? (
              <button
                type="button"
                className="btn btn--large"
                onClick={() => {
                  playSfx('sfx-choice');
                  dispatch({ type: 'START_QUEST', questId: offeredQuest });
                }}
                data-testid="start-quest"
              >
                {statuses[offeredQuest] === 'completed'
                  ? FA.again
                  : getQuestCopy(offeredQuest).childSummaryFa}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => dispatch({ type: 'CLOSE_DIALOGUE' })}
              data-testid="close-dialogue"
            >
              {FA.back}
            </button>
          </DialogueCard>
        ) : null}

        {state.mode === 'encounter' && state.encounter ? (
          <EncounterPanel
            encounter={state.encounter}
            onAdvance={() => {
              playSfx(state.encounter?.phase === 'reinforce' ? 'sfx-sticker' : 'sfx-success');
              dispatch({ type: 'ADVANCE_PHASE' });
            }}
            onChoose={(iconId: IconId, correct: boolean) => {
              playSfx('sfx-choice');
              dispatch({ type: 'CHOOSE', iconId, correct });
            }}
            onLeave={() => dispatch({ type: 'ABANDON_ENCOUNTER' })}
          />
        ) : null}

        {state.mode === 'hub' ? (
          state.webglAvailable ? (
            <p className="text text--soft hud__hint">{FA.hotspotHint}</p>
          ) : (
            // The whole slice stays playable through the DOM trail when WebGL
            // is missing; the notice must not cover the trail or the HUD.
            <WebglFallbackScreen onContinue={() => goToQuest(continueQuestId)} />
          )
        ) : null}
      </div>
    </div>
  );
}
