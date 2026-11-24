import { describe, expect, it } from 'vitest';
import { decodeGameplayState } from 'waypoint-rpg-gameplay';
import {
  createNewSession,
  dispatchGameplayIntent,
  encodeSave,
  loadSession,
  startPracticeEncounter,
  unlockedAbilities,
} from './game';
import { compiledGameplay } from './gameplay';

describe('generated tactical-only game', () => {
  it('restores mid-combat and grants a victory reward only once', () => {
    const initial = createNewSession('tactical-victory');
    expect(initial.state.inventory['ember-charm']).toBe(1);
    expect(initial.state.equipment.traveler?.charm).toBe('ember-charm');
    expect(unlockedAbilities(initial.state)).toContain('traveler-strike');
    const begun = startPracticeEncounter(initial.state);
    expect(begun.accepted).toBe(true);
    if (!begun.accepted) return;

    const restored = loadSession(encodeSave(begun.state));
    expect(restored.sessionOnly).toBe(false);
    expect(restored.state.encounter).toEqual(begun.state.encounter);
    const savedSnapshot = decodeGameplayState(compiledGameplay, restored.state);
    expect(savedSnapshot.ok).toBe(true);

    const attack = {
      type: 'use-ability' as const,
      participantId: 'traveler-turn',
      abilityId: 'traveler-strike',
      targetParticipantId: 'watcher-turn',
    };
    const won = dispatchGameplayIntent(restored.state, attack);
    expect(won.accepted).toBe(true);
    if (!won.accepted) return;
    expect(won.state.encounter?.outcome).toBe('victory');
    expect(won.state.outcomeMarkers).toHaveLength(1);
    expect(won.state.appliedRewardIds).toContain('encounter:duel-tactical-victory:victory');
    const repeated = dispatchGameplayIntent(won.state, attack);
    expect(repeated.accepted).toBe(false);
    expect(repeated.state).toBe(won.state);
    expect(won.state.outcomeMarkers).toHaveLength(1);
  });

  it('reaches defeat through an internal enemy turn and allows withdrawal as another outcome', () => {
    const active = startPracticeEncounter(createNewSession('tactical-defeat').state);
    expect(active.accepted).toBe(true);
    if (!active.accepted) return;
    const lost = dispatchGameplayIntent(active.state, {
      type: 'wait',
      participantId: 'traveler-turn',
    });
    expect(lost.accepted).toBe(true);
    if (lost.accepted) expect(lost.state.encounter?.outcome).toBe('defeat');

    const another = startPracticeEncounter(createNewSession('tactical-withdraw').state);
    expect(another.accepted).toBe(true);
    if (!another.accepted) return;
    const withdrawn = dispatchGameplayIntent(another.state, { type: 'withdraw' });
    expect(withdrawn.accepted).toBe(true);
    if (withdrawn.accepted) expect(withdrawn.state.encounter?.outcome).toBe('withdrawn');
  });

  it('keeps corrupt save bytes and session-only gameplay separate from persistent saves', () => {
    const original = '{bad tactical save';
    const recovered = loadSession(original);
    expect(recovered.ready).toBe(false);
    expect(recovered.sessionOnly).toBe(true);
    expect(recovered.preservedBytes).toBe(original);
  });
});
