import type { NpcSimState } from '../domain/world/types.ts';
import type { QuestId, QuestStatus } from '../domain/game/types.ts';
import { nextSeed, seedUnit } from './critters.ts';

/**
 * Presentation liveliness vocabulary — Delight Pass PR 1.
 *
 * These cues and poses are pure visual polish: bounded, deterministic, and
 * deliberately NOT semantic animation. They never record to
 * `window.__worldAnimationEvents` — that stream answers "what semantic thing
 * happened?", and a resting pose or a blink is not a semantic event.
 * `CharacterReact` (notices-child / greets-child) remains the only child-facing
 * semantic character operation.
 *
 * Every cue is event-triggered (arrival, world-time tick, entering idle),
 * plays one bounded flourish, then stops — the demand renderer returns to
 * idle. No permanent loop, no per-frame nearest-NPC search.
 */

/** One bounded idle gesture. `blink` needs face-eye meshes; callers pass
    `looks-around` for figures without them (critters). */
export type NpcIdleCue = 'looks-around' | 'blink';

/** Static pose derived from the routine spot's activity — a held transform,
    not an animation. `happy` is never assigned by a routine spot: it exists
    only as a fact-derived override (see `resolveNpcPresentation`). */
export type NpcActivityPose = 'working' | 'resting' | 'talking' | 'waiting' | 'happy';

/** Routine activity → static pose. `walking`/`at-home` visitors read as
    resting/idle at their spot; there is no walking schedule spot today. */
export function activityPoseFor(activity: NpcSimState): NpcActivityPose {
  switch (activity) {
    case 'working':
      return 'working';
    case 'talking':
      return 'talking';
    case 'waiting':
    case 'walking':
      return 'waiting';
    case 'at-home':
      return 'resting';
  }
}

/** Held transform deltas applied to an inner pose group — no motion. */
export interface ActivityPoseTransform {
  readonly rotationX: number;
  readonly rotationZ: number;
  readonly offsetY: number;
}

export function activityPoseTransform(pose: NpcActivityPose): ActivityPoseTransform {
  switch (pose) {
    // Leaning over the work (planter, basket, oven).
    case 'working':
      return { rotationX: 0.09, rotationZ: 0, offsetY: -0.02 };
    // Settled low, slightly reclined — resting, not slumped.
    case 'resting':
      return { rotationX: -0.06, rotationZ: 0.04, offsetY: -0.05 };
    // Engaged: a small sideways tilt reads as mid-conversation.
    case 'talking':
      return { rotationX: 0, rotationZ: 0.05, offsetY: 0 };
    // Neutral held pose — barely off vertical.
    case 'waiting':
      return { rotationX: 0, rotationZ: -0.03, offsetY: 0 };
    // Fact-derived warmth: a brighter, slightly lifted bearing — upright and
    // open, the opposite of `resting`'s settled slump.
    case 'happy':
      return { rotationX: -0.04, rotationZ: -0.06, offsetY: 0.03 };
  }
}

/**
 * Fact-derived world reactions — Delight Pass PR 4.
 *
 * Persistent world memory is never stored: it is RESOLVED. A small table
 * maps an already-persisted fact (a completed quest) onto presentation
 * deltas for one NPC — the world changes because the save changed, so a
 * reload after completing the quest shows the same warm baker. No new
 * persisted fields, no world event log, no flags.
 *
 * `attentionContext` stays inside the existing `CharacterReact` vocabulary:
 * a friend earns `greets-child` (the wave) on arrival instead of the
 * neutral `notices-child` — still one semantic cue per arrival per NPC.
 */
export interface NpcPresentation {
  readonly attentionContext: 'notices-child' | 'greets-child';
  readonly pose?: NpcActivityPose;
}

interface FactPresentation {
  readonly npcId: string;
  readonly questId: QuestId;
  readonly attentionContext: 'greets-child';
  readonly pose: NpcActivityPose;
}

/** One row per (fact → reaction). Deliberately tiny — this table is the
    whole "world remembers" surface, not a database. */
const NPC_FACT_PRESENTATION: readonly FactPresentation[] = [
  // The child carried the baker's bread — the baker greets them like a
  // friend now (wave on approach + a brighter bearing).
  {
    npcId: 'npc-baker',
    questId: 'quest-bread-errand',
    attentionContext: 'greets-child',
    pose: 'happy',
  },
];

const NEUTRAL_PRESENTATION: NpcPresentation = { attentionContext: 'notices-child' };

/** Resolve one NPC's presentation from persisted facts. Pure and total:
    unknown NPCs and unmet facts always yield the neutral presentation. */
export function resolveNpcPresentation(
  npcId: string,
  statuses: Record<QuestId, QuestStatus>,
): NpcPresentation {
  for (const row of NPC_FACT_PRESENTATION) {
    if (row.npcId === npcId && statuses[row.questId] === 'completed') {
      return { attentionContext: row.attentionContext, pose: row.pose };
    }
  }
  return NEUTRAL_PRESENTATION;
}

/**
 * The idle cue a figure plays on a given world-time tick. Deterministic in
 * (npcIndex, tick) so e2e, screenshots, and unit tests agree; ~1 in 4 ticks
 * plays nothing — the world stirs, it does not fidget.
 */
export function idleCueFor(npcIndex: number, worldTime: number): NpcIdleCue | null {
  if (worldTime <= 0) return null;
  const unit = seedUnit(nextSeed(npcIndex * 7919 + worldTime * 104729 + 31));
  if (unit < 0.35) return 'blink';
  if (unit < 0.75) return 'looks-around';
  return null;
}
