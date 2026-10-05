/**
 * Reactive-prop vocabulary — Delight Pass PR 2.
 *
 * A child taps a physical thing and the thing does ONE bounded physical
 * reaction, then settles back: the flower bends and returns, the door swings
 * open a touch and closes, the fountain bloops while its fish dart away.
 *
 * These are presentation liveliness, not semantic animation: nothing here
 * records to `window.__worldAnimationEvents`, and nothing here is a quest,
 * a mandatory action, or a second interaction model. The object stays the
 * subject of the interaction (docs/LIVING-WORLD.md).
 *
 * Deterministic and cheap: a tap starts one flourish; the demand renderer
 * idles again when it ends. No permanent loops, no per-object state beyond
 * the flourish clock.
 */

/** The closed tap-reaction vocabulary. New kinds need a second real use. */
export type PropReaction = 'bend' | 'sway' | 'bloop' | 'door-swing';

/** Seconds one flourish runs — all short enough to feel immediate, all finite. */
export const REACTION_SECONDS: Record<PropReaction, number> = {
  bend: 0.6,
  sway: 0.7,
  bloop: 0.45,
  'door-swing': 0.9,
};

export interface PropReactionTransform {
  readonly rotationX: number;
  readonly rotationY: number;
  readonly rotationZ: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

const REST: PropReactionTransform = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scaleX: 1,
  scaleY: 1,
};

/**
 * The flourish curve for `reaction` at progress `t` in [0,1]. Rest pose at
 * both ends — reactions return the object to where the child found it.
 */
export function reactionTransform(reaction: PropReaction, t: number): PropReactionTransform {
  if (t <= 0 || t >= 1) return REST;
  const arc = Math.sin(Math.PI * t);
  switch (reaction) {
    case 'bend':
      // Flower bows forward and eases back upright.
      return { ...REST, rotationX: arc * 0.5 };
    case 'sway':
      // Plant wiggles side to side, damped so it settles mid-flourish.
      return { ...REST, rotationZ: Math.sin(t * Math.PI * 2) * 0.28 * (1 - t) };
    case 'bloop':
      // Fountain squash — a watery "boop" that also reads as the fish's cue.
      return { ...REST, scaleX: 1 + arc * 0.06, scaleY: 1 - arc * 0.12 };
    case 'door-swing':
      // Door opens a crack around its hinge and closes again.
      return { ...REST, rotationY: -arc * 0.85 };
  }
}

/**
 * Probe log for e2e/QA — the presentation layer's counterpart to the
 * `__worldAttention` probe, deliberately separate from the semantic
 * `__worldAnimationEvents` stream. Session-local, capped; App.tsx publishes
 * it as `window.__worldReactions` only when the world probe is enabled.
 */
export interface ReactionProbeEntry {
  readonly seq: number;
  readonly subject: string;
  readonly reaction: PropReaction;
}

const reactionLog: ReactionProbeEntry[] = [];
let nextReactionSeq = 0;

export function recordReactionProbe(subject: string, reaction: PropReaction): void {
  reactionLog.push({ seq: nextReactionSeq++, subject, reaction });
  if (reactionLog.length > 20) reactionLog.shift();
}

/** The live log array — callers publish the reference, not a snapshot. */
export function reactionProbeLog(): readonly ReactionProbeEntry[] {
  return reactionLog;
}

/**
 * Lifecycle counters for the reactive presentation layer — the counterpart
 * to `__worldAnimationStats`, kept deliberately separate: `active` counts
 * flourishes currently transforming, and must return to 0 once every
 * reaction settles. Session-local, published as `__worldReactionStats` only
 * when the world probe is enabled.
 */
export interface ReactionStats {
  started: number;
  active: number;
  completed: number;
}

const reactionStats: ReactionStats = { started: 0, active: 0, completed: 0 };

export function reactionStarted(): void {
  reactionStats.started += 1;
  reactionStats.active += 1;
}

/** A flourish ended early (a new tap retargeted it) without reaching rest. */
export function reactionAborted(): void {
  reactionStats.active -= 1;
}

/** A flourish reached its rest pose — the demand renderer goes idle again. */
export function reactionCompleted(): void {
  reactionStats.active -= 1;
  reactionStats.completed += 1;
}

/** The live stats object — callers publish the reference, not a snapshot. */
export function reactionStatsProbe(): ReactionStats {
  return reactionStats;
}
