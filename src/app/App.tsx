import { useCallback, useEffect, useRef, useState } from 'react';
import { DIALOGUE_NODES, getDialogueNode } from '../content/fa/dialogue.ts';
import type { NpcDefinition } from '../domain/world/types.ts';
import {
  getNpcOrNull,
  NPC_DEFINITIONS,
  npcFigureJitter,
  npcStandingAt,
  resolveNpcActivity,
  resolveNpcSpot,
} from '../world/registry.ts';
import { getNpcCopy, getQuestCopy } from '../content/fa/quests.ts';
import { FA } from '../content/fa/strings.ts';
import { selectCompletedQuestCount, selectQuestStatuses } from '../domain/game/selectors.ts';
import type { AnchorId, IconId, QuestId, QuestStatus } from '../domain/game/types.ts';
import { getQuestDefinition, QUEST_DEFINITIONS } from '../domain/quests/definitions.ts';
import { canStartQuest, nextSuggestedQuest } from '../domain/quests/prerequisites.ts';
import { QuestCelebration } from '../ui/child/Celebration.tsx';
import { DialogueCard } from '../ui/child/DialogueCard.tsx';
import { emotionEmoji, npcEmoji } from '../ui/child/emoji.ts';
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
  TitleScreen,
  WebglFallbackScreen,
} from '../ui/child/screens.tsx';
import { ParentArea } from '../ui/parent/ParentArea.tsx';
import { ParentGate } from '../ui/parent/ParentGate.tsx';
import { WorldCanvas } from '../world/WorldCanvas.tsx';
import type { NpcAttention } from '../world/sceneBits.tsx';
import type { HubHandle } from '../world/Hub.tsx';
import { getAnchorOrNull } from '../world/navigation/graph.ts';
import { getMap, transitionForAnchor } from '../world/maps.ts';
import { useGame } from './gameContext.ts';

function nodeForQuest(questId: QuestId): string | null {
  return DIALOGUE_NODES.find((node) => node.offersQuestId === questId)?.id ?? null;
}

/**
 * Whoever is physically standing at `anchor` at `worldTime` answers: their
 * current routine spot's contextual greeting when they have one, otherwise
 * their default entry node (quest offer first). An empty spot stays quiet —
 * nobody answers where nobody stands.
 */
function nodeForNpc(
  npc: NpcDefinition,
  worldTime: number,
  quests: Record<QuestId, QuestStatus>,
): string | null {
  // A quest the child can still do always outranks the routine's flavour
  // line — the greeting must never hide the start-quest button.
  const questNode = npc.dialogueIds
    .map((id) => DIALOGUE_NODES.find((node) => node.id === id))
    .find(
      (node) =>
        node?.offersQuestId !== null &&
        node?.offersQuestId !== undefined &&
        (quests[node.offersQuestId] === 'available' || quests[node.offersQuestId] === 'active'),
    );
  if (questNode) return questNode.id;
  const spot = resolveNpcSpot(npc, worldTime);
  return (
    spot?.dialogueId ??
    npc.dialogueIds[0] ??
    DIALOGUE_NODES.find((node) => node.npcId === npc.id)?.id ??
    null
  );
}

export function App() {
  const {
    state,
    dispatch,
    cacheStatus,
    updateReady,
    applyUpdate,
    installReady,
    installApp,
    resetProgress,
    playSfx,
    profiles,
    activeProfileId,
    selectProfile,
    startNewPlayer,
    chooseAvatar,
    resetProfile,
    renameProfile,
    deleteProfile,
  } = useGame();
  const hubRef = useRef<HubHandle>(null);
  // Which beat of a multi-line dialogue node is showing — transient UI state.
  // Keyed by node so a node change (branch jumps included) restarts at 0
  // without an effect.
  const [dialogueLine, setDialogueLine] = useState<{ nodeId: string | null; index: number }>({
    nodeId: null,
    index: 0,
  });
  const openNodeId = state.dialogue?.nodeId ?? null;
  const dialogueLineIndex = dialogueLine.nodeId === openNodeId ? dialogueLine.index : 0;
  const statuses = selectQuestStatuses(state);
  const completed = selectCompletedQuestCount(state);
  const suggestedQuestId = nextSuggestedQuest(state);
  // Session-only UI affordances: never persisted, never part of game state.
  const [worldHintSeen, setWorldHintSeen] = useState(false);
  // Mode-B kid test (?kidtest=nocopy): the encounter plays with no rendered
  // copy — questions are pictures. Read once; never persisted.
  const [noCopyTest] = useState(
    () => new URLSearchParams(window.location.search).get('kidtest') === 'nocopy',
  );
  const [albumOpen, setAlbumOpen] = useState(false);
  const [celebrating, setCelebrating] = useState<QuestId | null>(null);
  // Who noticed the child arriving — the figure gives a brief non-verbal
  // attention cue. `nonce` replays the cue on repeat arrivals.
  const [attention, setAttention] = useState<NpcAttention | null>(null);
  const attentionNonceRef = useRef(0);
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

  // Coarse world clock: one tick per arrival drives every NPC routine —
  // event-driven, deterministic, and never per-frame. The ref mirrors the
  // state so arrival-time resolution reads the post-tick value immediately.
  const [worldTime, setWorldTime] = useState(0);
  const worldTimeRef = useRef(0);
  // A walk started by tapping a person must not tick the routine clock —
  // otherwise the arrival relocates the very NPC the child is walking to
  // (an endless chase). Exploration ticks; conversation does not.
  const skipArrivalTick = useRef(false);

  const discoveries = state.discoveries;

  // E2E/QA probe: the authoritative map + found facts. Lets tests wait for
  // discoveries/transitions instead of guessing walk durations.
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    if (import.meta.env.DEV || w['__WORLD_PROBE']) {
      w['__worldMapId'] = state.mapId;
      w['__worldDiscoveries'] = state.discoveries;
      // Where every NPC stands this tick — lets e2e observe routines without
      // raycasting the scene graph.
      w['__worldAttention'] = attention;
      w['__worldDialogueNpc'] = state.dialogue?.npcId ?? null;
      w['__worldNpcs'] = Object.fromEntries(
        NPC_DEFINITIONS.map((npc) => {
          const spot = resolveNpcSpot(npc, worldTime);
          const anchor = getAnchorOrNull(spot?.anchorId ?? npc.anchorId);
          return [
            npc.id,
            {
              anchorId: spot?.anchorId ?? npc.anchorId,
              activity: resolveNpcActivity(npc, worldTime),
              dialogueId: spot?.dialogueId ?? npc.dialogueIds[0] ?? null,
              x: (anchor?.x ?? 0) + 0.9 + (spot?.offsetX ?? 0) + npcFigureJitter(npc.id).x,
              z: (anchor?.z ?? 0) - 0.4 + (spot?.offsetZ ?? 0) + npcFigureJitter(npc.id).z,
            },
          ];
        }),
      );
    }
  }, [state.mapId, state.discoveries, state.dialogue, worldTime, attention]);
  const onArrive = useCallback(
    (anchor: AnchorId) => {
      setWorldHintSeen(true);
      playSfx('sfx-arrive');
      // Map transitions are resolved from data: an anchor carrying a
      // transitionId either reveals itself once (a found secret persists)
      // or ferries the child to the matching anchor on the other map.
      const transition = transitionForAnchor(anchor);
      if (transition) {
        if (transition.discoveryId && !discoveries.includes(transition.discoveryId)) {
          dispatch({ type: 'DISCOVER', discoveryId: transition.discoveryId });
          return;
        }
        dispatch({ type: 'CHANGE_MAP', mapId: transition.toMap, anchorId: transition.toAnchor });
        return;
      }
      const skipTick = skipArrivalTick.current;
      skipArrivalTick.current = false;
      if (!skipTick) {
        worldTimeRef.current += 1;
        setWorldTime(worldTimeRef.current);
      }
      // Arriving never opens dialogue — walking and talking are separate
      // actions. Whoever stands at the anchor just notices the child: a
      // brief non-verbal cue (turn/bounce), no card.
      const present = npcStandingAt(anchor, worldTimeRef.current);
      if (present !== null) {
        attentionNonceRef.current += 1;
        setAttention({ npcId: present.id, nonce: attentionNonceRef.current });
      }
    },
    [playSfx, discoveries, dispatch],
  );

  // Tapping a person (not just a place) talks to them where they stand:
  // walk to their current routine spot, then hear the line for what they
  // are doing there. Falls back to opening the dialogue directly when the
  // spot can't be walked to.
  const onNpcTap = useCallback(
    (npcId: string) => {
      const npc = getNpcOrNull(npcId);
      if (!npc) return;
      const spot = resolveNpcSpot(npc, worldTimeRef.current);
      const anchor = (spot?.anchorId ?? npc.anchorId) as AnchorId;
      // Capture the right entry now (quest offer outranks routine flavour)
      // so the walk itself cannot change which line the child hears.
      const node = nodeForNpc(npc, worldTimeRef.current, statuses);
      const open = () => {
        skipArrivalTick.current = false;
        openNpc(node);
      };
      skipArrivalTick.current = true;
      if (!hubRef.current?.goTo(anchor, open)) open();
    },
    [openNpc, statuses],
  );

  const goToQuest = useCallback(
    (questId: QuestId) => {
      const definition = getQuestDefinition(questId);
      // Without a world to walk in (no WebGL) the trail still reaches the
      // quest — the DOM fallback opens the dialogue directly.
      if (!state.webglAvailable) {
        openNpc(nodeForQuest(questId));
        return;
      }
      if ((definition.mapId ?? 'map-town') !== state.mapId) return;
      const npc = getNpcOrNull(definition.steps[0]?.npcId ?? 'npc-elder');
      // Walk to where the NPC actually stands now (their routine spot), not
      // their home anchor — the camera lands on them, not an empty spot.
      const spot = npc ? resolveNpcSpot(npc, worldTimeRef.current) : null;
      const anchorId = (spot?.anchorId ?? npc?.anchorId ?? null) as AnchorId | null;
      // A quest chip is navigation, not conversation: walk there and stop.
      // Talking stays the child's choice — a tap on the person opens it.
      if (anchorId) hubRef.current?.goTo(anchorId);
    },
    [openNpc, state.mapId, state.webglAvailable],
  );

  switch (state.mode) {
    case 'boot':
      return <LoadingScreen />;

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
          onSelect={(avatarId, headwear) => {
            playSfx('sfx-choice');
            chooseAvatar(avatarId, headwear);
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
          onDeleteProfile={deleteProfile}
          onQualityChange={(tier) => dispatch({ type: 'SET_QUALITY_TIER', tier })}
          updateReady={updateReady}
          onApplyUpdate={applyUpdate}
          installReady={installReady}
          onInstallApp={installApp}
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
  // One idea per beat: nodes may carry a short line sequence; single-beat
  // nodes fall back to `textFa`. Lines stay in data, never in JSX branches.
  const dialogueLines = dialogueNode
    ? (dialogueNode.lines ?? [{ speakerId: dialogueNode.npcId, textFa: dialogueNode.textFa }])
    : [];
  const lineIndex = Math.min(dialogueLineIndex, Math.max(0, dialogueLines.length - 1));
  const currentLine = dialogueLines[lineIndex] ?? null;
  const isLastLine = lineIndex >= dialogueLines.length - 1;
  const lineEmotion =
    dialogueNode?.lines?.[lineIndex]?.emotion !== undefined
      ? emotionEmoji(dialogueNode.lines[lineIndex].emotion)
      : null;
  // First unfinished chapter — the big fallback button continues progress
  // instead of always reopening the greeting quest.
  const continueQuestId =
    QUEST_DEFINITIONS.find((quest) => {
      const status = statuses[quest.id];
      return status === 'available' || status === 'active';
    })?.id ?? 'quest-greeting';

  // Where the child stands on the mounted map: the persisted spot when it
  // belongs to this map (reload replays it), otherwise the map's own spawn.
  const persistedAnchor = getAnchorOrNull(state.mapAnchorId);
  const spawnAnchor =
    persistedAnchor && persistedAnchor.mapId === state.mapId
      ? persistedAnchor.id
      : getMap(state.mapId).spawnAnchorId;

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
          onNpcTap={onNpcTap}
          worldTime={worldTime}
          onContextLost={() => dispatch({ type: 'WEBGL_AVAILABILITY_CHANGED', available: false })}
          handleRef={hubRef}
          suggestedQuestId={suggestedQuestId}
          mapId={state.mapId}
          startAnchorId={spawnAnchor}
          discoveries={state.discoveries}
          attention={attention}
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
        <QuestTrail
          statuses={statuses}
          currentId={suggestedQuestId}
          mapId={state.mapId}
          onGo={goToQuest}
        />
      </div>

      {/* Every child modal obeys one rule: a tap outside the card leaves it
          and never reaches the world beneath — no confirmation, no lost
          progress. The backdrop sits below the HUD strips so the trail and
          pause stay reachable. */}
      {state.mode === 'dialogue' || state.mode === 'encounter' ? (
        <div
          className="hud__backdrop"
          data-testid="modal-backdrop"
          onPointerDown={(event) => {
            event.stopPropagation();
            dispatch({
              type: state.mode === 'dialogue' ? 'CLOSE_DIALOGUE' : 'ABANDON_ENCOUNTER',
            });
          }}
        />
      ) : null}

      <div className="hud__bottom">
        {state.mode === 'dialogue' && dialogueNode && currentLine ? (
          <DialogueCard
            speakerFa={
              lineEmotion !== null
                ? `${getNpcCopy(currentLine.speakerId)?.nameFa ?? ''} ${lineEmotion}`
                : getNpcCopy(currentLine.speakerId)?.nameFa
            }
            speakerEmoji={npcEmoji(currentLine.speakerId)}
            iconId={dialogueNode.iconId}
            textFa={currentLine.textFa}
            testId="npc-dialogue"
            hideText={noCopyTest}
          >
            {!isLastLine ? (
              <button
                type="button"
                className="btn btn--large"
                onClick={() => {
                  playSfx('sfx-choice');
                  setDialogueLine({ nodeId: openNodeId, index: dialogueLineIndex + 1 });
                }}
                data-testid="dialogue-next"
              >
                {FA.next}
              </button>
            ) : null}
            {isLastLine
              ? (dialogueNode.choices ?? []).map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className="btn btn--large"
                    onClick={() => {
                      playSfx('sfx-choice');
                      dispatch({
                        type: 'OPEN_DIALOGUE',
                        npcId: dialogueNode.npcId,
                        nodeId: choice.nextNodeId,
                      });
                    }}
                    data-testid={`dialogue-choice-${choice.id}`}
                  >
                    {choice.labelFa}
                  </button>
                ))
              : null}
            {isLastLine && dialogueNode.nextNodeId !== undefined ? (
              <button
                type="button"
                className="btn btn--large"
                onClick={() => {
                  playSfx('sfx-choice');
                  dispatch({
                    type: 'OPEN_DIALOGUE',
                    npcId: dialogueNode.npcId,
                    nodeId: dialogueNode.nextNodeId!,
                  });
                }}
                data-testid="dialogue-next-node"
              >
                {FA.next}
              </button>
            ) : null}
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
            hideCopy={noCopyTest}
            onAdvance={() => {
              // Only the step-completion beat chimes — passive beats auto-play
              // and a jingle per beat would read as noise.
              if (state.encounter?.phase === 'reinforce') playSfx('sfx-sticker');
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
