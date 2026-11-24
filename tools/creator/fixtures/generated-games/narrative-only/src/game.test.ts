import { describe, expect, it } from 'vitest';
import { getFact } from 'waypoint-rpg-narrative';
import { createNewSession, dispatchNarrativeIntent, encodeSave, loadSession } from './game';

function choosePath(playthroughId: string, choiceId: string) {
  let state = createNewSession(playthroughId).state;
  const opened = dispatchNarrativeIntent(state, {
    type: 'open-dialogue',
    dialogueId: 'traveler-question',
  });
  expect(opened.accepted).toBe(true);
  if (!opened.accepted) throw new Error('Dialogue did not open.');
  state = opened.state;
  const chosen = dispatchNarrativeIntent(state, { type: 'choose', choiceId });
  expect(chosen.accepted).toBe(true);
  if (!chosen.accepted) throw new Error('Branch choice was rejected.');
  return chosen.state;
}

describe('generated narrative-only game', () => {
  it('keeps distinct endings and restores a saved branch through the public package', () => {
    const truth = choosePath('truth-playthrough', 'choose-truth');
    expect(getFact(truth, 'chosen-path')).toBe('truth');
    const restored = loadSession(encodeSave(truth));
    expect(restored.state).toEqual(truth);
    expect(restored.sessionOnly).toBe(false);
    const finish = dispatchNarrativeIntent(restored.state, { type: 'finish' });
    expect(finish.accepted).toBe(true);
    if (!finish.accepted) return;
    expect(finish.state.endingId).toBe('ending-truth');

    const peace = choosePath('peace-playthrough', 'choose-peace');
    const otherFinish = dispatchNarrativeIntent(peace, { type: 'finish' });
    expect(otherFinish.accepted).toBe(true);
    if (otherFinish.accepted) expect(otherFinish.state.endingId).toBe('ending-peace');
  });

  it('keeps invalid saved bytes intact and disables automatic writes', () => {
    const bytes = '{broken save';
    const recovered = loadSession(bytes);
    expect(recovered.ready).toBe(false);
    expect(recovered.sessionOnly).toBe(true);
    expect(recovered.preservedBytes).toBe(bytes);
    expect(recovered.warning).toContain('آسیب');
  });
});
