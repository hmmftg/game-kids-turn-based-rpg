import { transitionGameplay } from 'waypoint-rpg-gameplay';
import { describe, expect, it } from 'vitest';
import {
  createAnimationGameplayDemo,
  createAnimationMoveCommand,
  applyAnimationProjection,
  projectGameplayAnimationChanges,
} from './gameplay-demo.js';

describe('gameplay animation projection', () => {
  it('maps accepted player and deterministic enemy movement to their own move actions', () => {
    const demo = createAnimationGameplayDemo('animation-projection-test');
    const command = createAnimationMoveCommand(demo.state);
    const result = transitionGameplay(demo.compiled, demo.state, command);

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.revision).toBe(demo.state.revision + 2);
    expect(result.state.encounter?.combatants.map(({ id, position }) => [id, position.x])).toEqual([
      ['traveler', 1],
      ['guardian', 5],
    ]);
    expect(projectGameplayAnimationChanges(demo.state, result, command)).toEqual({
      traveler: 'move',
      guardian: 'move',
    });
  });

  it('does not project a stale rejected command as an animation', () => {
    const demo = createAnimationGameplayDemo('animation-stale-command-test');
    const command = createAnimationMoveCommand(demo.state);
    const accepted = transitionGameplay(demo.compiled, demo.state, command);
    expect(accepted.accepted).toBe(true);
    if (!accepted.accepted) return;

    const stale = transitionGameplay(demo.compiled, accepted.state, command);
    expect(stale.accepted).toBe(false);
    expect(stale.state).toBe(accepted.state);
    expect(projectGameplayAnimationChanges(accepted.state, stale, command)).toEqual({});
  });

  it('advances only the committed actor action revision and allows intentional repeats', () => {
    const previous = Object.freeze({
      traveler: Object.freeze({ action: 'idle' as const, revision: 3 }),
      guardian: Object.freeze({ action: 'idle' as const, revision: 7 }),
    });
    const first = applyAnimationProjection(previous, { traveler: 'move' });

    expect(first.traveler).toEqual({ action: 'move', revision: 4 });
    expect(first.guardian).toBe(previous.guardian);
    const repeated = applyAnimationProjection(first, { traveler: 'move' });
    expect(repeated.traveler?.revision).toBe(5);
    expect(applyAnimationProjection(repeated, {})).toBe(repeated);
  });
});
