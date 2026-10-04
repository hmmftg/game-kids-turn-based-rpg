import { describe, expect, it } from 'vitest';
import {
  activityPoseFor,
  activityPoseTransform,
  idleCueFor,
  type NpcActivityPose,
} from './liveliness.ts';
import type { NpcSimState } from '../domain/world/types.ts';
import { NPC_DEFINITIONS } from './registry.ts';

describe('activityPoseFor', () => {
  it('maps every routine activity onto the closed pose vocabulary', () => {
    const states: readonly NpcSimState[] = ['at-home', 'walking', 'working', 'talking', 'waiting'];
    const poses = states.map((state) => activityPoseFor(state));
    for (const pose of poses) {
      expect(['working', 'resting', 'talking', 'waiting']).toContain(pose);
    }
    expect(activityPoseFor('working')).toBe('working');
    expect(activityPoseFor('talking')).toBe('talking');
    expect(activityPoseFor('waiting')).toBe('waiting');
    expect(activityPoseFor('walking')).toBe('waiting');
    expect(activityPoseFor('at-home')).toBe('resting');
  });
});

describe('activityPoseTransform', () => {
  it('returns a held transform for every pose — bounded deltas, no extremes', () => {
    const poses: readonly NpcActivityPose[] = ['working', 'resting', 'talking', 'waiting'];
    for (const pose of poses) {
      const t = activityPoseTransform(pose);
      expect(Math.abs(t.rotationX)).toBeLessThan(0.2);
      expect(Math.abs(t.rotationZ)).toBeLessThan(0.2);
      expect(Math.abs(t.offsetY)).toBeLessThanOrEqual(0.05);
    }
    // Distinct activities must read differently — a pose table that maps
    // everything to the same transform would be decorative noise.
    const distinct = new Set(poses.map((pose) => JSON.stringify(activityPoseTransform(pose))));
    expect(distinct.size).toBe(poses.length);
  });
});

describe('idleCueFor', () => {
  it('is deterministic in (npcIndex, tick)', () => {
    for (const tick of [1, 2, 3, 7, 11]) {
      expect(idleCueFor(3, tick)).toBe(idleCueFor(3, tick));
    }
    // Neighbours must not all fidget in unison — over enough ticks, two
    // different NPCs produce different cue sequences.
    const a = Array.from({ length: 20 }, (_, i) => idleCueFor(0, i + 1));
    const b = Array.from({ length: 20 }, (_, i) => idleCueFor(7, i + 1));
    expect(a).not.toEqual(b);
  });

  it('only emits the closed cue vocabulary or null', () => {
    for (let npc = 0; npc < 12; npc++) {
      for (let tick = 0; tick < 30; tick++) {
        expect([null, 'blink', 'looks-around']).toContain(idleCueFor(npc, tick));
      }
    }
  });

  it('plays nothing at tick 0 — the world starts still', () => {
    for (let npc = 0; npc < NPC_DEFINITIONS.length; npc++) {
      expect(idleCueFor(npc, 0)).toBeNull();
    }
  });

  it('varies across ticks — some ticks stir, some stay quiet', () => {
    const cues = new Set<ReturnType<typeof idleCueFor>>();
    for (let tick = 1; tick <= 40; tick++) {
      cues.add(idleCueFor(4, tick));
    }
    expect(cues.has(null)).toBe(true);
    expect(cues.size).toBeGreaterThan(1);
  });
});
