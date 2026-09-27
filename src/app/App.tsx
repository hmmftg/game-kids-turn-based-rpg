import { useCallback, useEffect, useRef, useState } from 'react';
import { DIALOGUE_NODES, getDialogueNode } from '../content/fa/dialogue.ts';
import { getNpcCopy, getQuestCopy } from '../content/fa/quests.ts';
import { FA } from '../content/fa/strings.ts';
import { selectCompletedQuestCount, selectQuestStatuses } from '../domain/game/selectors.ts';
import type { AnchorId, IconId, QuestId } from '../domain/game/types.ts';
import { getQuestDefinition, QUEST_DEFINITIONS } from '../domain/quests/definitions.ts';
import { canStartQuest, nextSuggestedQuest } from '../domain/quests/prerequisites.ts';
import { QuestCelebration } from '../ui/child/Celebration.tsx';
import { DialogueCard } from '../ui/child/DialogueCard.tsx';
import { npcEmoji } from '../ui/child/emoji.ts';
import { EncounterPanel } from '../ui/child/EncounterPanel.tsx';
import { InteractionHint } from '../ui/child/InteractionHint.tsx';
import { ObjectiveChip } from '../ui/child/ObjectiveChip.tsx';
import { PauseMenu } from '../ui/child/PauseMenu.tsx';
import { ProfileSelectScreen } from '../ui/child/ProfileSelectScreen.tsx';
import { QuestTrail, StickerShelf } from '../ui/child/QuestTrail.tsx';
import { StickerAlbum } from '../ui/child/StickerAlbum.tsx';
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
  const {
    state,
    dispatch,
    cacheStatus,
    updateReady,
    applyUpdate,
    resetProgress,
    playSfx,
    profiles,
    activeProfileId,
    selectProfile,
    startNewPlayer,
    chooseAvatar,
    resetProfile,
    renameProfile,
  } = useGame();
  const hubRef = useRef<HubHandle>(null);
  const statuses = selectQuestStatuses(state);
  const completed = selectCompletedQuestCount(state);
  const suggestedQuestId = nextSuggestedQuest(state);
  // Session-only UI affordances: never persisted, never part of game state.
  const [worldHintSeen, setWorldHintSeen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [celebrating, setCelebrating] = useState<QuestId | null>(null);
  const previousCompletedRef = useRef<number | null>(null);
  // Highest checkpoint timestamp observed this session. Persisted checkpoints
  // carry the earlier session's completion time and re-hydrated ones repeat a
  // timestamp already seen, so only a strictly newer 'questCompleted' stamp is
  // a fresh win — reload, profile select, and switch-back can never replay it.
  const seenCheckpointAtRef = useRef<number | null>(null);

  // Presentation-only celebration: the reducer has already completed the quest
  // and granted the sticker before this fires; the overlay just reports it.
  useEffect(() => {
    const seenAt = seenCheckpointAtRef.current;
    seenCheckpointAtRef.current = Math.max(seenAt ?? 0, state.checkpoint.at);
    const previous = previousCompletedRef.current;
    previousCompletedRef.current = completed;
    if (
      previous !== null &&
      completed > previous &&
      state.checkpoint.kind === 'questCompleted' &&
      state.checkpoint.questId !== null &&
      seenAt !== null &&
      state.checkpoint.at > seenAt
    ) {
      setCelebrating(state.checkpoint.questId);
      playSfx('sfx-success');
      playSfx('sfx-sticker');
    }
  }, [completed, state.checkpoint, playSfx]);

  const openNpc = useCallback(
    (nodeId: string | null) => {
      if (nodeId === null) return;
      const node = getDialogueNode(nodeId);
      if (!node) return;
      dispatch({ type: 'OPEN_DIALOGUE', npcId: node.npcId, nodeId: node.id });
    },
    [dispatch],
  );

  const onArrive = useCallback(
    (anchor: AnchorId) => {
      setWorldHintSeen(true);
      playSfx('sfx-arrive');
      openNpc(nodeForAnchor(anchor));
    },
    [openNpc, playSfx],
  );

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

    case 'profileSelect':
      return (
        <ProfileSelectScreen
          profiles={profiles}
          onSelect={selectProfile}
          onNew={() => {
            playSfx('sfx-choice');
            startNewPlayer();
          }}
          onParent={() => dispatch({ type: 'OPEN_PARENT_GATE' })}
        />
      );

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
          onSelect={(avatarId, badge, headwear) => {
            playSfx('sfx-choice');
            chooseAvatar(avatarId, badge, headwear);
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
          profiles={profiles}
          activeProfileId={activeProfileId}
          onClose={() => dispatch({ type: 'CLOSE_PARENT' })}
          onReset={resetProgress}
          onResetProfile={resetProfile}
          onRenameProfile={renameProfile}
          onQualityChange={(tier) => dispatch({ type: 'SET_QUALITY_TIER', tier })}
          updateReady={updateReady}
          onApplyUpdate={applyUpdate}
        />
      );

    case 'paused':
      return (
        <PauseMenu
          audio={state.audio}
          onResume={() => dispatch({ type: 'RESUME' })}
          onAudioChange={(audio) => dispatch({ type: 'SET_AUDIO_SETTINGS', audio })}
          onParentArea={() => dispatch({ type: 'OPEN_PARENT_GATE' })}
          onSwitchPlayer={() => dispatch({ type: 'SWITCH_PLAYER' })}
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
          headwear={state.headwear}
          questStatuses={statuses}
          completedCount={completed}
          interactive={state.mode === 'hub'}
          qualityTier={state.qualityTier}
          onArrive={onArrive}
          onContextLost={() => dispatch({ type: 'WEBGL_AVAILABILITY_CHANGED', available: false })}
          handleRef={hubRef}
          suggestedQuestId={suggestedQuestId}
        />
      ) : null}

      <div className="hud__top">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => dispatch({ type: 'PAUSE' })}
          data-testid="pause-button"
          aria-label={FA.pause}
        >
          <span className="emoji" aria-hidden="true">
            ⏸️
          </span>{' '}
          {FA.pause}
        </button>
        <StickerShelf stickers={state.stickers} onOpen={() => setAlbumOpen(true)} />
      </div>

      {state.mode === 'hub' || state.mode === 'dialogue' ? (
        <div className="hud__objective">
          <ObjectiveChip questId={suggestedQuestId} />
        </div>
      ) : null}

      <div className="hud__side">
        <QuestTrail statuses={statuses} currentId={suggestedQuestId} onGo={goToQuest} />
      </div>

      <div className="hud__bottom">
        {state.mode === 'dialogue' && dialogueNode ? (
          <DialogueCard
            speakerFa={getNpcCopy(dialogueNode.npcId)?.nameFa}
            speakerEmoji={npcEmoji(dialogueNode.npcId)}
            iconId={dialogueNode.iconId}
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
              {FA.backToHood}
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
              playSfx(correct ? 'sfx-choice' : 'sfx-retry');
              dispatch({ type: 'CHOOSE', iconId, correct });
            }}
            onLeave={() => dispatch({ type: 'ABANDON_ENCOUNTER' })}
          />
        ) : null}

        {state.mode === 'hub' ? (
          state.webglAvailable ? (
            worldHintSeen ? (
              <p className="text text--soft hud__hint">{FA.hotspotHint}</p>
            ) : (
              <InteractionHint />
            )
          ) : (
            // The whole slice stays playable through the DOM trail when WebGL
            // is missing; the notice must not cover the trail or the HUD.
            <WebglFallbackScreen onContinue={() => goToQuest(continueQuestId)} />
          )
        ) : null}
      </div>

      {albumOpen ? (
        <StickerAlbum stickers={state.stickers} onClose={() => setAlbumOpen(false)} />
      ) : null}

      {celebrating !== null && state.mode === 'hub' ? (
        <QuestCelebration questId={celebrating} onDone={() => setCelebrating(null)} />
      ) : null}
    </div>
  );
}
