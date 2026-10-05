import { describe, expect, it } from 'vitest';
import {
  reactionProbeLog,
  reactionTransform,
  recordReactionProbe,
  REACTION_SECONDS,
  type FlourishReaction,
} from './reactions.ts';

const ALL: FlourishReaction[] = ['bend', 'sway', 'bloop', 'door-swing'];

describe('reactive-prop vocabulary', () => {
  it('returns the rest transform at both ends of every reaction', () => {
    for (const reaction of ALL) {
      for (const t of [0, 1, -0.1, 1.1]) {
        const pose = reactionTransform(reaction, t);
        expect(pose.rotationX).toBe(0);
        expect(pose.rotationY).toBe(0);
        expect(pose.rotationZ).toBe(0);
        expect(pose.scaleX).toBe(1);
        expect(pose.scaleY).toBe(1);
      }
    }
  });

  it('moves mid-flourish, bounded and deterministic', () => {
    for (const reaction of ALL) {
      const a = reactionTransform(reaction, 0.25);
      const b = reactionTransform(reaction, 0.25);
      expect(a).toEqual(b);
      const moved =
        Math.abs(a.rotationX) +
        Math.abs(a.rotationY) +
        Math.abs(a.rotationZ) +
        Math.abs(a.scaleX - 1) +
        Math.abs(a.scaleY - 1);
      expect(moved).toBeGreaterThan(0.05);
      // Every channel stays inside a small physical arc — no flourishes that
      // fling an object off its stand.
      expect(Math.abs(a.rotationX)).toBeLessThanOrEqual(0.55);
      expect(Math.abs(a.rotationY)).toBeLessThanOrEqual(0.9);
      expect(Math.abs(a.rotationZ)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(a.scaleX - 1)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(a.scaleY - 1)).toBeLessThanOrEqual(0.15);
    }
  });

  it('keeps every flourish short enough to feel immediate', () => {
    for (const seconds of Object.values(REACTION_SECONDS)) {
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(1);
    }
  });
});

describe('reaction probe log', () => {
  it('appends subject/reaction entries with monotonic seq', () => {
    const before = reactionProbeLog().length;
    recordReactionProbe('probe-flower', 'bend');
    recordReactionProbe('probe-fountain', 'bloop');
    const log = reactionProbeLog();
    expect(log.length).toBe(before + 2);
    expect(log[log.length - 2]).toMatchObject({ subject: 'probe-flower', reaction: 'bend' });
    expect(log[log.length - 1]).toMatchObject({ subject: 'probe-fountain', reaction: 'bloop' });
    expect(log[log.length - 1]!.seq).toBe(log[log.length - 2]!.seq + 1);
  });

  it('keeps seq monotonic past the 20-entry cap', () => {
    for (let i = 0; i < 30; i += 1) recordReactionProbe(`overflow-${i}`, 'bend');
    const log = reactionProbeLog();
    expect(log.length).toBe(20);
    for (let i = 1; i < log.length; i += 1) {
      expect(log[i]!.seq).toBe(log[i - 1]!.seq + 1);
    }
  });
});
