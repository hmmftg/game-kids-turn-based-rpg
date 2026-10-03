/**
 * Dev-only semantic animation instrumentation.
 *
 * Every semantic animation instance created by the animation layer records
 * an episode entry on `window.__worldAnimationEvents` and liveness counters
 * on `window.__worldAnimationStats`. It counts ONLY semantic instances from
 * this layer — never passive CSS transitions, audio playback, ambient
 * critters, or camera follow — so `active === 0` between semantic episodes
 * proves no permanent animation loop exists to keep a cue alive.
 *
 * Enabled when `import.meta.env.DEV` or the page sets `__WORLD_PROBE`
 * (the e2e harness does). Production builds emit nothing.
 */

export interface SemanticAnimationEvent {
  /** Verb the child should perceive — matches the primitive vocabulary. */
  readonly type:
    | 'object-lift'
    | 'object-drop'
    | 'object-open'
    | 'object-bounce'
    | 'object-fly-to'
    | 'object-separate'
    | 'object-uncover'
    | 'object-receive'
    | 'character-react';
  /** The physical subject — the object or person the child sees move. */
  readonly subjectId: string;
  /** Who performs/receives the action, when relevant (e.g. 'player', 'npc-sara'). */
  readonly actorId?: string | undefined;
  /** Closed CharacterReact vocabulary — only for type 'character-react'. */
  readonly context?:
    | 'receives-kite'
    | 'receives-shell'
    | 'receives-crystal'
    | 'looks-at-book'
    | 'questioning'
    | 'greets-child'
    | 'notices-child'
    | 'celebrates'
    | undefined;
  readonly startedAt: number;
  readonly completedAt: number;
}

export interface AnimationStats {
  active: number;
  started: number;
  completed: number;
}

interface AnimationProbeWindow {
  __WORLD_PROBE?: boolean;
  __worldAnimationEvents?: SemanticAnimationEvent[];
  __worldAnimationStats?: AnimationStats;
}

/**
 * `active` is derived, not timer-maintained: an instance is active while
 * `completedAt` is still in the future. This stays truthful even when the
 * browser throttles `setTimeout` (emulated mobile, backgrounded pages), and
 * it can never be left stale by an unmounted component.
 */
function createStats(w: AnimationProbeWindow): AnimationStats {
  const events = () => w.__worldAnimationEvents ?? [];
  const stats: AnimationStats = {
    started: 0,
    get completed() {
      const now = performance.now();
      return events().filter((e) => e.completedAt <= now).length;
    },
    get active() {
      const now = performance.now();
      return events().filter((e) => e.completedAt > now).length;
    },
  };
  return stats;
}

function probe(): AnimationProbeWindow | null {
  const w = window as unknown as AnimationProbeWindow;
  if (!import.meta.env.DEV && !w.__WORLD_PROBE) return null;
  w.__worldAnimationEvents ??= [];
  w.__worldAnimationStats ??= createStats(w);
  return w;
}

/** One step inside a semantic episode — emitted at `offsetMs`, lasting `durationMs`. */
export interface EpisodeStep {
  readonly type: SemanticAnimationEvent['type'];
  readonly subjectId: string;
  readonly actorId?: string | undefined;
  readonly context?: SemanticAnimationEvent['context'] | undefined;
  /** Offset within the episode (ms). */
  readonly at?: number;
  /** How long this step runs (ms); 0 under reduced motion. */
  readonly duration: number;
}

/**
 * Records a whole semantic episode: pushes every step's event record eagerly
 * with computed timestamps, so the log is complete synchronously. Liveness is
 * derived from those timestamps — `stats.active` returns to 0 as soon as the
 * last step's `completedAt` passes, with no timers to throttle or leak.
 */
export function recordEpisode(steps: readonly EpisodeStep[]): void {
  const w = probe();
  if (w === null) return;
  const base = performance.now();
  for (const step of steps) {
    const at = step.at ?? 0;
    w.__worldAnimationEvents!.push({
      type: step.type,
      subjectId: step.subjectId,
      actorId: step.actorId,
      context: step.context,
      startedAt: base + at,
      completedAt: base + at + step.duration,
    });
    w.__worldAnimationStats!.started += 1;
  }
}
