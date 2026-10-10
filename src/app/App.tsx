import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { battleForOpponent, getBattleCopy } from '../content/fa/battles.ts';
import { DIALOGUE_NODES, getDialogueNode } from '../content/fa/dialogue.ts';
import type { NpcDefinition } from '../domain/world/types.ts';
import {
  getNpcOrNull,
  npcFigurePosition,
  resolveNpcActivity,
  resolveNpcSpot,
  resolveNpcStand,
} from '../world/registry.ts';
import { STATIC_WORLD_SOURCE, worldForDiscoveries } from '../world/worldSource.ts';
import { reactionProbeLog, reactionStatsProbe } from '../world/reactions.ts';
import { resolveNpcPresentation } from '../world/liveliness.ts';
import { FACT_DECORATIONS } from '../world/decorations.ts';
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
import { NearbySheet } from '../ui/child/NearbySheet.tsx';
import { PauseMenu } from '../ui/child/PauseMenu.tsx';
import { DiagnosticsPanel } from '../ui/parent/DiagnosticsPanel.tsx';
import { ProfileSelectScreen } from '../ui/child/ProfileSelectScreen.tsx';
import { QuestTrail, StickerShelf } from '../ui/child/QuestTrail.tsx';
import { SceneGlyph } from '../ui/child/SceneChoice.tsx';
import { sceneElementFor } from '../ui/child/contextInteraction.ts';
import { StickerAlbum } from '../ui/child/StickerAlbum.tsx';
import { BattleScene } from '../ui/child/BattleScene.tsx';
import {
  AvatarSelectScreen,
  ErrorScreen,
  LoadingScreen,
  TitleScreen,
  WebglFallbackScreen,
} from '../ui/child/screens.tsx';
import { ParentArea } from '../ui/parent/ParentArea.tsx';
import { ParentGate } from '../ui/parent/ParentGate.tsx';
import { ResearchGate } from '../ui/parent/ResearchGate.tsx';
import {
  endResearchSession,
  exportResearchJson,
  isResearchActive,
  record,
  recordBookmark,
  recordPassiveBeat,
  researchSessionId,
  startResearchSession,
} from '../services/research/recorder.ts';
import { flushResearchQueue, researchEndpointConfigured } from '../services/research/queue.ts';
import type { AgeBand } from '../domain/research/types.ts';
import { WorldCanvas } from '../world/WorldCanvas.tsx';
import type { NpcAttention } from '../world/sceneBits.tsx';
import type { HubHandle } from '../world/Hub.tsx';
import { getAnchorOrNull } from '../world/navigation/graph.ts';
import { zoomForMap } from '../world/camera.ts';
import { battleFrameTarget } from '../world/battleCamera.ts';
import {
  cameraFocus,
  clearCameraFocusOverride,
  setCameraFocusOverride,
  updateCameraFocusOverride,
} from '../world/CameraRig.tsx';
import { getMap, transitionForAnchor } from '../world/maps.ts';
import { nearbyNpcs } from '../world/nearby.ts';
import { useGame } from './gameContext.ts';

// The shipped world: gameplay resolves every anchor/NPC/transition through
// this one source — the same seam the World Builder swaps for a document.
const WORLD = STATIC_WORLD_SOURCE;

/** How close an arrival can land to a figure's stand before that figure is
 *  "held" — it keeps its current routine spot while the child is beside it
 *  and resumes its schedule when the child next lands out of reach. */
const APPROACH_RADIUS = 3.0;

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
  const battleCopy = state.battle !== null ? getBattleCopy(state.battle.battleId) : null;
  // Session-only UI affordances: never persisted, never part of game state.
  const [worldHintSeen, setWorldHintSeen] = useState(false);
  // Kid-test URL flags (?kidtest=nocopy,noactionicons, repeatable/comma-
  // separated): the encounter plays with no rendered copy and/or with every
  // non-physical action affordance stripped. Read once; never persisted.
  const [kidTestFlags] = useState(
    () =>
      new Set(
        new URLSearchParams(window.location.search)
          .getAll('kidtest')
          .flatMap((value) => value.split(/[\s,]+/))
          .filter((flag) => flag.length > 0),
      ),
  );
  const noCopyTest = kidTestFlags.has('nocopy');
  // `?diagnostics=1` — parent/dev gate (same pattern as ?worldbuilder=1):
  // publishes the live world handle and reveals the diagnostics HUD button.
  const diagnosticsEnabled = new URLSearchParams(window.location.search).get('diagnostics') === '1';
  // Research Session Mode (PR R+) is ON by default: every fresh launch
  // presents the consent gate — recording still starts only when a parent
  // starts a session, never silently. `?research=0` / `?mode=game` opts the
  // session out (what the gate's exit button sets). Unit tests opt out via
  // the test-mode build flag — the gate's e2e coverage lives in
  // e2e/research.spec.ts.
  const [researchRequested] = useState(() => {
    if (import.meta.env.MODE === 'test') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('research') !== '0' && params.get('mode') !== 'game';
  });
  const [researchConsent, setResearchConsent] = useState(isResearchActive());
  const noActionIcons = kidTestFlags.has('noactionicons');
  const [albumOpen, setAlbumOpen] = useState(false);
  const [celebrating, setCelebrating] = useState<QuestId | null>(null);
  // Who noticed the child arriving — the figure gives a brief non-verbal
  // attention cue. `nonce` replays the cue on repeat arrivals.
  const [attention, setAttention] = useState<NpcAttention | null>(null);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  // Avatar position snapshot taken when the sheet opens — "who is near me"
  // is answered at the moment the child asks, not per render.
  const [nearbyPos, setNearbyPos] = useState({ x: 0, z: 0 });
  const attentionNonceRef = useRef(0);
  // Arrival identity: increments exactly once per avatar arrival. Every
  // arrival-triggered behaviour (avatar flourish, NPC idle cue via the
  // world-time tick, notices-child) keys off this or the tick, so a given
  // arrival produces at most one cue per target regardless of rerenders,
  // dwell time, or repeated demand renders.
  const [arrivalNonce, setArrivalNonce] = useState(0);
  const arrivalNonceRef = useRef(0);
  const suppressNoticeForRef = useRef<string | null>(null);
  const previousCompletedRef = useRef<number | null>(null);
  // Highest checkpoint timestamp observed this session. Persisted checkpoints
  // carry the earlier session's completion time and re-hydrated ones repeat a
  // timestamp already seen, so only a strictly newer 'questCompleted' stamp is
  // a fresh win — reload, profile select, and switch-back can never replay it.
  const seenCheckpointAtRef = useRef<number | null>(null);
  // Session-only world memory: finds the child uncovered this session. It
  // lives above the per-map scene mount — `Hub` remounts on every map
  // transition (cave round-trips), so the set must live here or the finds
  // would re-cover. Session memory survives remounts; a reload clears it.
  // Never persisted — no reducer, no PersistedState, no storage.
  const [revealedFinds, setRevealedFinds] = useState<ReadonlySet<string>>(new Set());
  const revealWorldFind = useCallback(
    (findId: string) =>
      setRevealedFinds((set) => (set.has(findId) ? set : new Set(set).add(findId))),
    [],
  );

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
      record('completed_action', { questId: state.checkpoint.questId });
      playSfx('sfx-success');
      playSfx('sfx-sticker');
    }
  }, [completed, state.checkpoint, playSfx]);

  const openNpc = useCallback(
    (nodeId: string | null) => {
      if (nodeId === null) return;
      const node = getDialogueNode(nodeId);
      if (!node) return;
      record('found_npc', { npcId: node.npcId });
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
  // Per-NPC routine holds: npcId → the tick its stand is frozen at while
  // the child stands beside it. Session-only presentation memory, like
  // worldTime — never persisted. `npcStandTicks` is the render-prop copy.
  const heldTicks = useRef(new Map<string, number>());
  const [npcStandTicks, setNpcStandTicks] = useState<ReadonlyMap<string, number>>(new Map());

  const discoveries = state.discoveries;

  // The walkable world the child sees right now: the static source minus
  // edges whose `requiresDiscoveryId` fact isn't recorded yet — a pure edge
  // filter, so every other world table stays shared (worldForDiscoveries).
  const walkableWorld = useMemo(() => worldForDiscoveries(WORLD, discoveries), [discoveries]);

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
      // Session-only find memory — probe-visible so e2e can assert it
      // survives scene remounts and clears on reload.
      w['__worldRevealedFinds'] = [...revealedFinds];
      // Fact-derived decorations — probe-visible so e2e can assert the
      // persistent world change resolves from the saved fact alone.
      w['__worldFactDecorations'] = FACT_DECORATIONS.filter(
        (d) => statuses[d.questId] === 'completed',
      ).map((d) => d.id);
      w['__worldReactions'] = reactionProbeLog();
      w['__worldReactionStats'] = reactionStatsProbe();
      w['__worldDialogueNpc'] = state.dialogue?.npcId ?? null;
      w['__worldBattleState'] = state.battle;
      // Phase history for e2e: one row per phase entry (and battle end).
      type BattleEvent = { mark: string; battle: unknown };
      const events = (w['__worldBattleEvents'] ??= [] as BattleEvent[]) as BattleEvent[];
      const last = events[events.length - 1];
      const mark = state.battle === null ? 'end' : `${state.battle.phase}@${state.battle.round}`;
      if (mark !== last?.mark && (state.battle !== null || last?.mark !== 'end')) {
        events.push({ mark, battle: state.battle });
      }
      w['__worldTime'] = worldTime;
      w['__worldNpcs'] = Object.fromEntries(
        WORLD.npcDefinitions.map((npc) => {
          const npcTick = npcStandTicks.get(npc.id) ?? worldTime;
          const stand = resolveNpcStand(WORLD, npc, npcTick);
          const at = npcFigurePosition(WORLD, npc, npcTick);
          return [
            npc.id,
            {
              anchorId: stand.anchorId,
              activity: resolveNpcActivity(npc, npcTick),
              dialogueId: stand.spot?.dialogueId ?? npc.dialogueIds[0] ?? null,
              x: at?.x ?? 0,
              z: at?.z ?? 0,
            },
          ];
        }),
      );
    }
  }, [
    state.mapId,
    state.discoveries,
    state.dialogue,
    state.battle,
    worldTime,
    attention,
    revealedFinds,
    statuses,
    npcStandTicks,
  ]);

  // Dialogue camera: the override is acquired only once the card is open —
  // the walk-to-talk chain (tap → walk → arrive → open) runs under the live
  // follow camera untouched. It frames the NPC's ACTUAL figure (the same
  // npcFigurePosition truth the renderer draws, at the figure's own held
  // tick), then releases through the owning token when the dialogue closes
  // or the conversation moves to someone else — the camera eases back to
  // the current base focus on its own. Pure presentation: no game state.
  useEffect(() => {
    const npcId = state.dialogue?.npcId ?? null;
    if (npcId === null) return;
    const npc = getNpcOrNull(WORLD, npcId);
    if (npc === null) return;
    const at = npcFigurePosition(WORLD, npc, heldTicks.current.get(npc.id) ?? worldTimeRef.current);
    if (at === null) return;
    const token = setCameraFocusOverride({
      x: at.x,
      z: at.z,
      zoom: zoomForMap(WORLD, state.mapId),
    });
    return () => {
      clearCameraFocusOverride(token);
    };
  }, [state.dialogue?.npcId, state.mapId]);

  // Battle camera staging: the SAME token-owned override, now driven by the
  // battle lifecycle instead of dialogue. ONE token owns the battle's frame
  // for the whole fight — START_BATTLE acquires it aimed at `intro`'s
  // subject, every phase transition re-targets it in place through
  // updateCameraFocusOverride (never a clear→reacquire gap), and the only
  // release is `state.battle` going null (LEAVE_BATTLE — the state
  // machine's only exit) or this owner unmounting. Phases, the reducer,
  // and game logic are untouched — pure presentation.
  const battleCameraToken = useRef<number | null>(null);
  useEffect(() => {
    const battle = state.battle;
    if (battle === null) {
      if (battleCameraToken.current !== null) {
        clearCameraFocusOverride(battleCameraToken.current);
        battleCameraToken.current = null;
      }
      return;
    }
    const npc = getNpcOrNull(WORLD, battle.opponentId);
    if (npc === null) return;
    const at = npcFigurePosition(WORLD, npc, heldTicks.current.get(npc.id) ?? worldTimeRef.current);
    if (at === null) return;
    const target = battleFrameTarget(battle.phase, at, cameraFocus);
    if (battleCameraToken.current === null) {
      battleCameraToken.current = setCameraFocusOverride({
        x: target.x,
        z: target.z,
        zoom: zoomForMap(WORLD, state.mapId),
      });
    } else {
      updateCameraFocusOverride(battleCameraToken.current, {
        x: target.x,
        z: target.z,
        zoom: zoomForMap(WORLD, state.mapId),
      });
    }
  }, [state.battle, state.mapId]);

  // Owner safety net: if this component unmounts mid-battle the token is
  // released so the module store never leaks a dead owner's frame.
  useEffect(
    () => () => {
      if (battleCameraToken.current !== null) {
        clearCameraFocusOverride(battleCameraToken.current);
        battleCameraToken.current = null;
      }
    },
    [],
  );

  const onArrive = useCallback(
    (anchor: AnchorId) => {
      setWorldHintSeen(true);
      playSfx('sfx-arrive');
      // Every completed avatar arrival gets exactly one identity —
      // exploration walks, walk-to-talk arrivals, and returns to the same
      // anchor alike. Monotonic and session-local: renders, camera moves,
      // and schedule ticks never mint one (docs/LIVING-WORLD.md).
      arrivalNonceRef.current += 1;
      setArrivalNonce(arrivalNonceRef.current);
      // Map transitions are resolved from data: an anchor carrying a
      // transitionId either reveals itself once (a found secret persists)
      // or ferries the child to the matching anchor on the other map.
      const transition = transitionForAnchor(WORLD, anchor);
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
      // People hold their ground while the child is beside them: an arrival
      // near a figure freezes THAT figure at its current routine tick —
      // the hold feeds the frozen tick back into the same resolveNpcStand
      // truth, so the tick below can still move the rest of the world but
      // never chases away the person the child just walked toward ("they
      // ran away from my tap" was the bug). A hold releases when a later
      // arrival lands out of reach. Distances use the figure-position
      // truth the renderer draws (stand anchor + NPC_STAND_OFFSET + spot
      // offset + jitter).
      const arrivalPos = getAnchorOrNull(WORLD, anchor);
      if (arrivalPos !== null) {
        const t = worldTimeRef.current;
        for (const npc of WORLD.npcDefinitions) {
          const at = npcFigurePosition(WORLD, npc, heldTicks.current.get(npc.id) ?? t);
          if (at === null) continue;
          const dx = at.x - arrivalPos.x;
          const dz = at.z - arrivalPos.z;
          if (dx * dx + dz * dz <= APPROACH_RADIUS * APPROACH_RADIUS) {
            if (!heldTicks.current.has(npc.id)) heldTicks.current.set(npc.id, t);
          } else {
            heldTicks.current.delete(npc.id);
          }
        }
        setNpcStandTicks(new Map(heldTicks.current));
      }
      if (!skipTick) {
        worldTimeRef.current += 1;
        setWorldTime(worldTimeRef.current);
      }
      // Arriving never opens dialogue — walking and talking are separate
      // actions. Whoever stands at the anchor just notices the child: a
      // brief non-verbal cue (turn/bounce), no card.
      const present =
        WORLD.npcDefinitions.find(
          (npc) =>
            resolveNpcStand(WORLD, npc, heldTicks.current.get(npc.id) ?? worldTimeRef.current)
              .anchorId === anchor,
        ) ?? null;
      // A walk the child started by tapping that same NPC already got its
      // acknowledgement — the greet IS the arrival cue; a notices-child on
      // top would be a competing second reaction.
      const suppressed = suppressNoticeForRef.current;
      suppressNoticeForRef.current = null;
      if (present !== null && present.id !== suppressed) {
        attentionNonceRef.current += 1;
        setAttention({
          npcId: present.id,
          nonce: attentionNonceRef.current,
          // Fact-derived warmth: a friend waves hello (greets-child) where a
          // stranger only notices — resolved from persisted quests, never
          // stored separately (docs/LIVING-WORLD.md).
          context: resolveNpcPresentation(present.id, statuses, discoveries).attentionContext,
          // The noticing belongs to THIS arrival — at most one
          // notices-child per (arrival, npc), provable in e2e.
          arrivalNonce: arrivalNonceRef.current,
        });
      }
    },
    [playSfx, discoveries, dispatch, statuses],
  );

  // Tapping a person (not just a place) talks to them where they stand:
  // walk to their current routine spot, then hear the line for what they
  // are doing there. Falls back to opening the dialogue directly when the
  // spot can't be walked to.
  const onNpcTap = useCallback(
    (npcId: string) => {
      if (state.battle !== null) return;
      // A battle opponent launches its micro battle directly — the tap on
      // the figure IS the launch; walking up never starts it.
      const battle = battleForOpponent(npcId);
      if (battle) {
        playSfx('sfx-choice');
        attentionNonceRef.current += 1;
        setAttention({ npcId, nonce: attentionNonceRef.current, context: 'greets-child' });
        dispatch({ type: 'START_BATTLE', definition: battle });
        return;
      }
      const npc = getNpcOrNull(WORLD, npcId);
      if (!npc) return;
      // Resolve the stand at the figure's own effective tick — a held NPC
      // is talked to at the spot the child sees it on.
      const npcTick = heldTicks.current.get(npc.id) ?? worldTimeRef.current;
      const anchor = resolveNpcStand(WORLD, npc, npcTick).anchorId;
      // Capture the right entry now (quest offer outranks routine flavour)
      // so the walk itself cannot change which line the child hears.
      const node = nodeForNpc(npc, npcTick, statuses);
      const open = () => {
        skipArrivalTick.current = false;
        openNpc(node);
      };
      skipArrivalTick.current = true;
      suppressNoticeForRef.current = npcId;
      // The greeting plays in parallel with the walk/dialogue — the NPC
      // reacts as soon as the child chooses them, never after a gate.
      attentionNonceRef.current += 1;
      setAttention({ npcId, nonce: attentionNonceRef.current, context: 'greets-child' });
      if (!hubRef.current?.goTo(anchor, open)) open();
    },
    [openNpc, statuses, playSfx, dispatch, state.battle],
  );

  const goToQuest = useCallback(
    (questId: QuestId) => {
      const definition = getQuestDefinition(questId);
      // Without a world to walk in (no WebGL) the trail still reaches the
      // quest — the DOM fallback opens the dialogue directly.
      if (!state.webglAvailable) {
        record('started_quest', { questId });
        openNpc(nodeForQuest(questId));
        return;
      }
      if ((definition.mapId ?? 'map-town') !== state.mapId) return;
      const npc = getNpcOrNull(WORLD, definition.steps[0]?.npcId ?? 'npc-elder');
      // Walk to where the NPC actually stands now (their routine spot), not
      // their home anchor — the camera lands on them, not an empty spot.
      const anchorId = npc
        ? resolveNpcStand(WORLD, npc, heldTicks.current.get(npc.id) ?? worldTimeRef.current)
            .anchorId
        : null;
      // A quest chip is navigation, not conversation: walk there and stop.
      // Talking stays the child's choice — a tap on the person opens it.
      if (anchorId) hubRef.current?.goTo(anchorId);
    },
    [openNpc, state.mapId, state.webglAvailable],
  );

  // Research consent stands between the URL flag and the game: a parent
  // starts the session (recording begins) or exits to the normal build.
  if (researchRequested && !researchConsent) {
    return (
      <ResearchGate
        onStart={(ageBand: AgeBand) => {
          startResearchSession({
            ageBand,
            mode: noCopyTest ? 'nocopy' : 'normal',
            reducedMotion:
              typeof matchMedia !== 'undefined' &&
              matchMedia('(prefers-reduced-motion: reduce)').matches,
            muted: state.audio.musicMuted && state.audio.sfxMuted,
          });
          setResearchConsent(true);
        }}
        onExit={() => {
          // Research is default-on — exiting marks this session opted out.
          const url = new URL(window.location.href);
          url.searchParams.set('research', '0');
          url.searchParams.delete('mode');
          window.location.assign(url.toString());
        }}
      />
    );
  }

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
            record('selected_avatar', { target: avatarId });
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
          onOpenWorldBuilder={() => {
            const url = new URL(window.location.href);
            url.searchParams.set('worldbuilder', '1');
            window.location.assign(url.toString());
          }}
          onOpenDiagnostics={() => {
            const url = new URL(window.location.href);
            url.searchParams.set('diagnostics', '1');
            window.location.assign(url.toString());
          }}
          researchActive={researchConsent && isResearchActive()}
          onExportResearch={() => void exportResearchJson()}
          onBookmark={(kind) => recordBookmark(kind, { areaId: state.mapId })}
          onEndResearch={() => {
            endResearchSession();
            setResearchConsent(false);
          }}
          onUploadResearch={
            researchEndpointConfigured()
              ? () => {
                  const id = researchSessionId();
                  return id === null
                    ? Promise.resolve()
                    : flushResearchQueue(id)
                        .then(() => undefined)
                        .catch(() => undefined);
                }
              : undefined
          }
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
  const persistedAnchor = getAnchorOrNull(WORLD, state.mapAnchorId);
  const spawnAnchor =
    persistedAnchor && persistedAnchor.mapId === state.mapId
      ? persistedAnchor.id
      : getMap(WORLD, state.mapId).spawnAnchorId;

  return (
    <div className="hud" data-testid="hud">
      {state.webglAvailable ? (
        <WorldCanvas
          world={walkableWorld}
          avatarId={state.avatarId}
          headwear={state.headwear}
          questStatuses={statuses}
          completedCount={completed}
          interactive={state.mode === 'hub' && state.battle === null}
          qualityTier={state.qualityTier}
          onArrive={onArrive}
          onNpcTap={onNpcTap}
          worldTime={worldTime}
          npcStandTicks={npcStandTicks}
          arrivalNonce={arrivalNonce}
          onContextLost={() => dispatch({ type: 'WEBGL_AVAILABILITY_CHANGED', available: false })}
          handleRef={hubRef}
          mapId={state.mapId}
          startAnchorId={spawnAnchor}
          discoveries={state.discoveries}
          attention={attention}
          revealedFinds={revealedFinds}
          onRevealFind={revealWorldFind}
          diagnostics={diagnosticsEnabled}
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
          <ObjectiveChip
            questId={suggestedQuestId}
            hideActionIcons={noActionIcons}
            hideText={noCopyTest}
          />
        </div>
      ) : null}

      <div className="hud__side">
        <QuestTrail
          statuses={statuses}
          currentId={suggestedQuestId}
          mapId={state.mapId}
          hideActionIcons={noActionIcons}
          hideText={noCopyTest}
          onGo={goToQuest}
        />
      </div>

      {/* Accessibility route for figure taps (PR N1): the people a child
          could tap in the world, as large DOM buttons. A row dispatches the
          same onNpcTap as the 3D figure — one meaning, two routes. */}
      {state.mode === 'hub' && state.battle === null && state.webglAvailable ? (
        <div className="hud__nearby">
          <button
            type="button"
            className="btn btn--secondary"
            data-testid="nearby-button"
            aria-label={FA.nearby}
            onClick={() => {
              playSfx('sfx-choice');
              setNearbyPos(hubRef.current?.playerPosition() ?? { x: 0, z: 0 });
              setNearbyOpen(true);
            }}
          >
            <span className="emoji" aria-hidden="true">
              👥
            </span>{' '}
            {FA.nearby}
          </button>
        </div>
      ) : null}

      {/* Live technical readout (?diagnostics=1, parent-facing): a HUD
          button opens the panel over the running world — the canvas has to
          stay mounted for real numbers, which rules out the parent area. */}
      {diagnosticsEnabled && state.webglAvailable ? (
        <div className="hud__diag">
          <button
            type="button"
            className="btn btn--secondary"
            data-testid="diag-button"
            aria-label={FA.diagnosticsOpen}
            onClick={() => setDiagOpen(true)}
          >
            <span className="emoji" aria-hidden="true">
              📊
            </span>
          </button>
        </div>
      ) : null}

      {diagOpen ? <DiagnosticsPanel state={state} onClose={() => setDiagOpen(false)} /> : null}

      {nearbyOpen ? (
        <NearbySheet
          entries={nearbyNpcs(WORLD, state.mapId, nearbyPos, worldTime)}
          title={FA.nearbyTitle}
          onPick={onNpcTap}
          onDismiss={() => setNearbyOpen(false)}
        />
      ) : null}

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
            // Each line/beat remounts so the card physically arrives — the
            // "a new thing happened" signal that never depends on reading.
            key={`${dialogueNode.id}:${dialogueLineIndex}`}
            speakerFa={
              lineEmotion !== null
                ? `${getNpcCopy(currentLine.speakerId)?.nameFa ?? ''} ${lineEmotion}`
                : getNpcCopy(currentLine.speakerId)?.nameFa
            }
            speakerEmoji={npcEmoji(currentLine.speakerId)}
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
              ? (dialogueNode.choices ?? []).map((choice) => {
                  // Object chips: the choice shows the thing, not an action
                  // icon — a choice with no physical target keeps its label.
                  const element = sceneElementFor(choice.iconId);
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      className="btn btn--large btn--icon choice"
                      onClick={() => {
                        playSfx('sfx-choice');
                        dispatch({
                          type: 'OPEN_DIALOGUE',
                          npcId: dialogueNode.npcId,
                          nodeId: choice.nextNodeId,
                        });
                      }}
                      data-testid={`dialogue-choice-${choice.id}`}
                      data-element={element ?? undefined}
                    >
                      {element !== null ? <SceneGlyph element={element} size={44} /> : null}
                      <span className="choice__label">{choice.labelFa}</span>
                    </button>
                  );
                })
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
                  record('started_quest', { questId: offeredQuest });
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
            hideActionIcons={noActionIcons}
            onAdvance={() => {
              // Only the step-completion beat chimes — passive beats auto-play
              // and a jingle per beat would read as noise.
              if (state.encounter?.phase === 'reinforce') playSfx('sfx-sticker');
              recordPassiveBeat({
                questId: state.encounter?.questId,
                phase: state.encounter?.phase,
              });
              dispatch({ type: 'ADVANCE_PHASE' });
            }}
            onChoose={(iconId: IconId, correct: boolean) => {
              playSfx(correct ? 'sfx-choice' : 'sfx-retry');
              dispatch({ type: 'CHOOSE', iconId, correct });
            }}
            onLeave={() => {
              record('abandoned', {
                questId: state.encounter?.questId,
                phase: state.encounter?.phase,
              });
              dispatch({ type: 'ABANDON_ENCOUNTER' });
            }}
          />
        ) : null}

        {/* Micro battle (PR I): `mode` stays 'hub' while battle !== null
            owns every child input — the overlay covers trail/pause/world
            alike, and the reducer guards the same commands server-side. */}
        {state.battle !== null && battleCopy !== null ? (
          <BattleScene
            battle={state.battle}
            copy={battleCopy}
            hideCopy={noCopyTest}
            onAdvance={() => dispatch({ type: 'ADVANCE_BATTLE_PHASE' })}
            onChoose={(action) => {
              playSfx('sfx-choice');
              dispatch({ type: 'CHOOSE_BATTLE_ACTION', action });
            }}
            onLeave={() => {
              // A terminal battle is a completed activity, not an abandon.
              const battle = state.battle;
              if (battle !== null && battle.phase !== 'victory' && battle.phase !== 'defeat') {
                record('abandoned', { battleId: battle.battleId, phase: battle.phase });
              }
              dispatch({ type: 'LEAVE_BATTLE' });
            }}
          />
        ) : null}

        {state.mode === 'hub' ? (
          state.webglAvailable ? (
            worldHintSeen || noActionIcons ? (
              noCopyTest || noActionIcons ? null : (
                <p className="text text--soft hud__hint">{FA.hotspotHint}</p>
              )
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
