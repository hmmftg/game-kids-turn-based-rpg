import type { Checkpoint, GameState, Mode, QuestId } from './types.ts';

/**
 * Modes in which the child is not inside an animation or a turn, so reloading
 * from here can never strand them. Autosave is only allowed from these modes.
 */
const STABLE_MODES: readonly Mode[] = ['title', 'avatarSelect', 'hub', 'parentArea'];

export function isStableMode(mode: Mode): boolean {
  return STABLE_MODES.includes(mode);
}

export function createCheckpoint(
  kind: Checkpoint['kind'],
  questId: QuestId | null,
  at: number,
): Checkpoint {
  return { kind, questId, at };
}

export function checkpointsEqual(a: Checkpoint, b: Checkpoint): boolean {
  return a.kind === b.kind && a.questId === b.questId;
}

/** The mode a resumed session should start in, given a restored checkpoint. */
export function resumeModeForCheckpoint(state: GameState): Extract<Mode, 'title' | 'hub'> {
  if (state.avatarId === null) return 'title';
  return state.checkpoint.kind === 'title' ? 'title' : 'hub';
}
