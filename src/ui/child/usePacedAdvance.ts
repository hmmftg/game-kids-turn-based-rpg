import { useEffect, useRef } from 'react';
import type { EncounterPhase } from '../../domain/game/types.ts';

/**
 * Dwell per passive phase — beats short enough that a waiting child never
 * feels the game stalled; the card tap skips ahead for a child who is ready.
 * `playerChoice` is absent: time never plays the child's turn for them.
 */
const PASSIVE_DWELL_MS: Partial<Record<EncounterPhase, number>> = {
  intro: 1400,
  demonstrate: 1200,
  worldResponse: 1200,
  reinforce: 950,
  complete: 700,
};

/** At most this much extra dwell for unusually long copy. */
const COPY_BONUS_CAP_MS = 300;
const MS_PER_COPY_CHAR = 12;

export function passiveDwellMs(phase: EncounterPhase, copyLength: number): number | null {
  const base = PASSIVE_DWELL_MS[phase];
  if (base === undefined) return null;
  return base + Math.min(copyLength * MS_PER_COPY_CHAR, COPY_BONUS_CAP_MS);
}

/**
 * Pacing layer: the reducer stays the source of truth for quest state; this
 * hook only decides *when* the UI asks for the next state. It schedules one
 * timeout per passive phase, reschedules on phase change, clears on unmount,
 * and pauses while the tab is hidden (restarting the current beat when the
 * tab returns). It never fires while hidden and never auto-selects a choice.
 */
export function usePacedAdvance(phase: EncounterPhase, copyLength: number, onAdvance: () => void) {
  const advanceRef = useRef(onAdvance);
  useEffect(() => {
    advanceRef.current = onAdvance;
  }, [onAdvance]);

  useEffect(() => {
    const dwell = passiveDwellMs(phase, copyLength);
    if (dwell === null) return;

    let timer: number | null = null;
    const clear = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const schedule = () => {
      clear();
      timer = window.setTimeout(() => {
        timer = null;
        advanceRef.current();
      }, dwell);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clear();
      } else {
        schedule();
      }
    };

    if (document.visibilityState === 'visible') schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase, copyLength]);
}
