import type { NpcSimState } from '../domain/world/types.ts';
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
    not an animation. */
export type NpcActivityPose = 'working' | 'resting' | 'talking' | 'waiting';

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
  }
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
