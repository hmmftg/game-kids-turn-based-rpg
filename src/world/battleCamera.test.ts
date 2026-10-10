import { beforeEach, describe, expect, it } from 'vitest';
import { BATTLE_PHASES } from '../domain/battle/types.ts';
import { battleFrameSubject, battleFrameTarget, BATTLE_FRAME_SUBJECT } from './battleCamera.ts';
import {
  clearCameraFocusOverride,
  getCameraFocusOverride,
  setCameraFocusOverride,
} from './CameraRig.tsx';

// The override store is module-level — reset via the owning token.
beforeEach(() => {
  const active = getCameraFocusOverride();
  if (active !== null) clearCameraFocusOverride(active.token);
});

const OPPONENT = { x: 2.5, z: -1.5 };
const PLAYER = { x: 0.5, z: 0.5 };

// Mirrors the App effect's call pattern: set on each phase, cleanup clears
// the token the run created.
const setForPhase = (phase: (typeof BATTLE_PHASES)[number], zoom = 64) => {
  const target = battleFrameTarget(phase, OPPONENT, PLAYER);
  const token = setCameraFocusOverride({ x: target.x, z: target.z, zoom });
  return { token, cleanup: () => clearCameraFocusOverride(token) };
};

describe('battle frame subjects', () => {
  it('assigns a subject to every battle phase', () => {
    for (const phase of BATTLE_PHASES) {
      expect(BATTLE_FRAME_SUBJECT[phase]).toBeDefined();
    }
    expect(battleFrameSubject('intro')).toBe('opponent');
    expect(battleFrameSubject('playerChoice')).toBe('midpoint');
    expect(battleFrameSubject('playerResolution')).toBe('opponent');
    expect(battleFrameSubject('enemyResolution')).toBe('opponent');
    expect(battleFrameSubject('roundCheck')).toBe('midpoint');
    expect(battleFrameSubject('victory')).toBe('opponent');
    expect(battleFrameSubject('defeat')).toBe('midpoint');
  });

  it('resolves the midpoint between the two figures', () => {
    expect(battleFrameTarget('playerChoice', OPPONENT, PLAYER)).toEqual({
      x: (OPPONENT.x + PLAYER.x) / 2,
      z: (OPPONENT.z + PLAYER.z) / 2,
    });
    expect(battleFrameTarget('intro', OPPONENT, PLAYER)).toEqual(OPPONENT);
  });
});

describe('battle camera lifecycle', () => {
  it('acquires the override on activation, aimed at the intro subject', () => {
    expect(getCameraFocusOverride()).toBeNull();
    const { cleanup } = setForPhase('intro');
    expect(getCameraFocusOverride()).toMatchObject({ x: OPPONENT.x, z: OPPONENT.z });
    cleanup();
  });

  it('re-frames on each phase transition; the old token cannot clear the new frame', () => {
    const first = setForPhase('intro');
    const second = setForPhase('playerChoice');
    // Phase advanced: the override now aims at the midpoint, and the
    // previous run's cleanup is a no-op against the newer owner.
    first.cleanup();
    expect(getCameraFocusOverride()).toMatchObject({
      x: (OPPONENT.x + PLAYER.x) / 2,
      token: second.token,
    });
    second.cleanup();
    expect(getCameraFocusOverride()).toBeNull();
  });

  it('keeps its terminal subject — victory/defeat hold until LEAVE_BATTLE', () => {
    const round = setForPhase('roundCheck');
    const terminal = setForPhase('victory');
    round.cleanup();
    // Terminal phase: no further automatic transition — the override stays
    // on the victory subject until the explicit exit clears the battle.
    expect(getCameraFocusOverride()).toMatchObject({ x: OPPONENT.x, z: OPPONENT.z });
    // LEAVE_BATTLE → battle null → the effect cleanup releases it.
    terminal.cleanup();
    expect(getCameraFocusOverride()).toBeNull();
  });

  it('explicit LEAVE_BATTLE cleanup releases the override from any phase', () => {
    const mid = setForPhase('enemyResolution');
    expect(getCameraFocusOverride()).not.toBeNull();
    mid.cleanup();
    expect(getCameraFocusOverride()).toBeNull();
  });
});
