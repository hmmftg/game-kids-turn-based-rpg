import { beforeEach, describe, expect, it } from 'vitest';
import { BATTLE_PHASES } from '../domain/battle/types.ts';
import { battleFrameSubject, battleFrameTarget, BATTLE_FRAME_SUBJECT } from './battleCamera.ts';
import {
  clearCameraFocusOverride,
  getCameraFocusOverride,
  setCameraFocusOverride,
  updateCameraFocusOverride,
} from './CameraRig.tsx';

// The override store is module-level — reset via the owning token.
beforeEach(() => {
  const active = getCameraFocusOverride();
  if (active !== null) clearCameraFocusOverride(active.token);
});

const OPPONENT = { x: 2.5, z: -1.5 };
const PLAYER = { x: 0.5, z: 0.5 };

// Mirrors the App effect's REAL ordering: ONE owner token for the whole
// battle — set once on activation, updateCameraFocusOverride on each phase
// transition (React runs the same effect body again, not a cleanup), and a
// single clear when state.battle goes null (LEAVE_BATTLE) or the owner
// unmounts.
class BattleCameraOwner {
  token: number | null = null;
  applyPhase(phase: (typeof BATTLE_PHASES)[number], zoom = 64) {
    const target = battleFrameTarget(phase, OPPONENT, PLAYER);
    if (this.token === null) {
      this.token = setCameraFocusOverride({ x: target.x, z: target.z, zoom });
    } else {
      updateCameraFocusOverride(this.token, { x: target.x, z: target.z, zoom });
    }
  }
  release() {
    if (this.token !== null) {
      clearCameraFocusOverride(this.token);
      this.token = null;
    }
  }
}

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
  it('acquires one owner token on activation, aimed at the intro subject', () => {
    expect(getCameraFocusOverride()).toBeNull();
    const owner = new BattleCameraOwner();
    owner.applyPhase('intro');
    expect(getCameraFocusOverride()).toMatchObject({ x: OPPONENT.x, z: OPPONENT.z });
    owner.release();
  });

  it('re-frames IN PLACE on each phase transition — same token, no clear→reacquire gap', () => {
    const owner = new BattleCameraOwner();
    owner.applyPhase('intro');
    const token = owner.token;
    for (const phase of ['playerChoice', 'playerResolution', 'enemyResolution'] as const) {
      owner.applyPhase(phase);
      // The same owner keeps the override throughout — the frame loop
      // never observes a null override between phases.
      expect(getCameraFocusOverride()?.token).toBe(token);
      expect(getCameraFocusOverride()).toMatchObject(battleFrameTarget(phase, OPPONENT, PLAYER));
    }
    owner.release();
  });

  it('keeps its terminal subject — victory/defeat hold until LEAVE_BATTLE', () => {
    const owner = new BattleCameraOwner();
    owner.applyPhase('roundCheck');
    owner.applyPhase('victory');
    // Terminal phase: no further automatic transition — the override stays
    // on the victory subject until the explicit exit clears the battle.
    expect(getCameraFocusOverride()).toMatchObject({ x: OPPONENT.x, z: OPPONENT.z });
    // LEAVE_BATTLE → battle null → release.
    owner.release();
    expect(getCameraFocusOverride()).toBeNull();
  });

  it('explicit LEAVE_BATTLE cleanup releases the override from any phase', () => {
    const owner = new BattleCameraOwner();
    owner.applyPhase('enemyResolution');
    expect(getCameraFocusOverride()).not.toBeNull();
    owner.release();
    expect(getCameraFocusOverride()).toBeNull();
  });

  it('a dialogue token that closes after battle started cannot kill the battle frame', () => {
    // Cross-owner ordering: dialogue set its override first, the battle
    // superseded it — the dialogue's late cleanup is a stale-token no-op.
    const dialogueToken = setCameraFocusOverride({ x: 1, z: 1, zoom: 64 });
    const owner = new BattleCameraOwner();
    owner.applyPhase('intro');
    clearCameraFocusOverride(dialogueToken);
    expect(getCameraFocusOverride()).toMatchObject({ x: OPPONENT.x, z: OPPONENT.z });
    owner.release();
  });
});
