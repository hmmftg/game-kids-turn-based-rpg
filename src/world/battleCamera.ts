import type { BattlePhase } from '../domain/battle/types.ts';
import type { CameraTarget } from './camera.ts';

/**
 * Battle camera staging — pure presentation. Which physical subject each
 * battle phase frames, expressed as the three honest targets the world
 * already knows: the opponent's figure, the midpoint between the figures
 * (both in shot — the "challenge" read), or the child. No second camera
 * animator: these feed the single token-owned focus override, and phases
 * or reducer logic never change.
 */
export type BattleFrameSubject = 'opponent' | 'midpoint' | 'player';

export const BATTLE_FRAME_SUBJECT: Record<BattlePhase, BattleFrameSubject> = {
  // Meeting the challenger — the child looks at who they chose.
  intro: 'opponent',
  // The child's turn to choose — both figures in shot.
  playerChoice: 'midpoint',
  // The child's action lands on the opponent.
  playerResolution: 'opponent',
  // The opponent's turn — the child watches them act.
  enemyResolution: 'opponent',
  // Beat between rounds — both figures in shot.
  roundCheck: 'midpoint',
  // The solved challenger celebrates — the child looks at them.
  victory: 'opponent',
  // A lost challenge lands softly — both figures in shot, never a close-up
  // on defeat for a pre-reader.
  defeat: 'midpoint',
};

export function battleFrameSubject(phase: BattlePhase): BattleFrameSubject {
  return BATTLE_FRAME_SUBJECT[phase];
}

/** Resolves a phase's subject into a concrete camera target. */
export function battleFrameTarget(
  phase: BattlePhase,
  opponent: CameraTarget,
  player: CameraTarget,
): CameraTarget {
  const subject = battleFrameSubject(phase);
  if (subject === 'opponent') return { x: opponent.x, z: opponent.z };
  if (subject === 'player') return { x: player.x, z: player.z };
  return { x: (opponent.x + player.x) / 2, z: (opponent.z + player.z) / 2 };
}
