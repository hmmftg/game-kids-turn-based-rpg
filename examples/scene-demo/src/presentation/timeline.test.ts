import { describe, expect, it } from 'vitest';
import { compileTimeline, createTimelinePlayer } from './timeline.js';

const registry = {
  cameras: {
    lantern: { position: [0, 3, 5], lookAt: [0, 1, 0] },
    game: { position: [0, 8, 9], lookAt: [0, 0, 0] },
  },
  actors: ['guardian'],
  dialogues: {
    greeting: { text: 'سلام، رهگذر.', locale: 'fa-IR' },
    blessing: { text: 'چراغ راه را روشن می‌کند.', locale: 'fa-IR' },
  },
  effects: { lanternGlow: { ownerId: 'lantern' } },
  audio: { gentleChime: { durationSeconds: 0.25, channel: 'ambience' } },
} as const;

const definition = {
  id: 'guardian-intro',
  version: 1,
  durationSeconds: 2,
  cues: [
    { id: 'look', atSeconds: 0, kind: 'camera', cameraId: 'lantern', durationSeconds: 0.4 },
    { id: 'greet', atSeconds: 0.25, kind: 'animation', actorId: 'guardian', action: 'interact' },
    { id: 'line', atSeconds: 0.5, kind: 'dialogue', dialogueId: 'greeting' },
    { id: 'tone', atSeconds: 0.7, kind: 'audio', audioId: 'gentleChime' },
    {
      id: 'glow',
      atSeconds: 1,
      kind: 'effect',
      effectId: 'lanternGlow',
      durationSeconds: 0.5,
    },
    { id: 'continue', atSeconds: 1.6, kind: 'wait', waitId: 'continue-greeting', mode: 'continue' },
  ],
} as const;

describe('cinematic timeline', () => {
  it('plays registered cues once in authored order with an explicit wait', () => {
    const timeline = compileTimeline(definition, registry);
    const player = createTimelinePlayer(timeline);
    const executionId = player.play();

    expect(player.advance(0.3).map(({ cue }) => cue.id)).toEqual(['look', 'greet']);
    expect(player.advance(0.3).map(({ cue }) => cue.id)).toEqual(['line']);
    expect(player.advance(1.1).map(({ cue }) => cue.id)).toEqual(['tone', 'glow', 'continue']);
    expect(player.snapshot()).toMatchObject({
      status: 'waiting',
      timeSeconds: 1.6,
      executionId,
      waitingFor: 'continue-greeting',
    });
    expect(player.advance(1)).toEqual([]);
    expect(player.resolveWait('wrong-wait')).toBeNull();
    expect(player.resolveWait('continue-greeting', 'unexpected-choice')).toBeNull();
    expect(player.resolveWait('continue-greeting')).toMatchObject({ executionId, choiceId: null });
    expect(player.advance(1)).toEqual([]);
    expect(player.snapshot().status).toBe('completed');
  });

  it('keeps a player choice explicit and only accepts an authored choice id', () => {
    const choiceTimeline = compileTimeline(
      {
        ...definition,
        cues: [
          {
            id: 'choose',
            atSeconds: 0.5,
            kind: 'wait',
            waitId: 'lantern-choice',
            mode: 'choice',
            choiceIds: ['light', 'leave'],
          },
          { id: 'blessing', atSeconds: 1, kind: 'dialogue', dialogueId: 'blessing' },
        ],
      },
      registry,
    );
    const player = createTimelinePlayer(choiceTimeline);
    const run = player.play();
    const [choiceCue] = player.advance(2);
    expect(choiceCue?.cue.kind).toBe('wait');
    expect(player.snapshot().status).toBe('waiting');
    expect(player.resolveWait('lantern-choice', 'unknown')).toBeNull();
    expect(player.resolveWait('lantern-choice', 'light')).toEqual({
      executionId: run,
      waitId: 'lantern-choice',
      choiceId: 'light',
    });
    expect(player.advance(0.5)).toHaveLength(1);
  });

  it('skips transient cues but stops at a choice and never chooses for the player', () => {
    const choiceTimeline = compileTimeline(
      {
        ...definition,
        cues: [
          { id: 'line', atSeconds: 0.2, kind: 'dialogue', dialogueId: 'greeting' },
          {
            id: 'choice',
            atSeconds: 0.5,
            kind: 'wait',
            waitId: 'choice',
            mode: 'choice',
            choiceIds: ['a', 'b'],
          },
          { id: 'end', atSeconds: 1, kind: 'dialogue', dialogueId: 'blessing' },
        ],
      },
      registry,
    );
    const player = createTimelinePlayer(choiceTimeline);
    player.play();
    player.advance(0.2);
    expect(player.skip().map(({ cue }) => cue.id)).toEqual(['choice']);
    expect(player.snapshot().status).toBe('waiting');
    expect(player.skip()).toEqual([]);
    expect(player.resolveWait('choice', 'a')?.choiceId).toBe('a');
    expect(player.advance(1).map(({ cue }) => cue.id)).toEqual(['end']);
  });

  it('replay gets a new execution identity and rejects stale callbacks', () => {
    const player = createTimelinePlayer(compileTimeline(definition, registry));
    const first = player.play();
    player.advance(0.1);
    player.cancel();
    player.cancel();
    const second = player.replay();

    expect(second).toBeGreaterThan(first);
    expect(player.isCurrentExecution(first)).toBe(false);
    expect(player.isCurrentExecution(second)).toBe(true);
    expect(player.snapshot()).toMatchObject({ status: 'playing', timeSeconds: 0 });
  });

  it('handles rapid play/cancel/play and idempotent disposal', () => {
    const player = createTimelinePlayer(compileTimeline(definition, registry));
    const first = player.play();
    player.cancel();
    const second = player.play();
    expect(player.isCurrentExecution(first)).toBe(false);
    expect(player.isCurrentExecution(second)).toBe(true);
    player.dispose();
    player.dispose();
    expect(player.snapshot().status).toBe('disposed');
    expect(player.isCurrentExecution(second)).toBe(false);
    expect(() => player.play()).toThrow(/disposed/i);
  });

  it('reduced motion keeps dialogue and deliberate waits available', () => {
    const player = createTimelinePlayer(compileTimeline(definition, registry));
    player.play({ reducedMotion: true });
    const events = player.advance(1 / 60);
    expect(events.map(({ cue }) => cue.kind)).toEqual([
      'camera',
      'animation',
      'dialogue',
      'audio',
      'effect',
      'wait',
    ]);
    expect(player.snapshot().status).toBe('waiting');
  });

  it('rejects unsupported versions, duplicate IDs, unknown references, bad order and invalid values', () => {
    expect(() => compileTimeline({ ...definition, version: 2 }, registry)).toThrow(/version/i);
    expect(() =>
      compileTimeline({ ...definition, cues: [{ ...definition.cues[0], atSeconds: 3 }] }, registry),
    ).toThrow(/cue time/i);
    expect(() =>
      compileTimeline(
        {
          ...definition,
          cues: [
            definition.cues[1],
            { id: 'earlier', atSeconds: 0, kind: 'dialogue', dialogueId: 'greeting' },
          ],
        },
        registry,
      ),
    ).toThrow(/order/i);
    expect(() =>
      compileTimeline(
        { ...definition, cues: [{ ...definition.cues[1], actorId: 'missing' }] },
        registry,
      ),
    ).toThrow(/unknown actor/i);
    expect(() =>
      compileTimeline(
        { ...definition, cues: [{ ...definition.cues[0], cameraId: 'missing' }] },
        registry,
      ),
    ).toThrow(/unknown camera/i);
    expect(() =>
      compileTimeline(
        { ...definition, cues: [{ ...definition.cues[2], dialogueId: 'missing' }] },
        registry,
      ),
    ).toThrow(/unknown dialogue/i);
    expect(() =>
      compileTimeline(
        { ...definition, cues: [{ ...definition.cues[3], audioId: 'missing' }] },
        registry,
      ),
    ).toThrow(/unknown audio/i);
    expect(() =>
      compileTimeline(
        { ...definition, cues: [{ ...definition.cues[4], effectId: 'missing' }] },
        registry,
      ),
    ).toThrow(/unknown effect/i);
    expect(() =>
      compileTimeline(
        { ...definition, cues: [{ ...definition.cues[0], durationSeconds: Number.NaN }] },
        registry,
      ),
    ).toThrow(/camera cue duration/i);
  });

  it('rejects duplicate IDs and overlapping camera, actor, audio, and effect ownership', () => {
    expect(() =>
      compileTimeline(
        { ...definition, cues: [definition.cues[1], { ...definition.cues[1] }] },
        registry,
      ),
    ).toThrow(/duplicated/i);
    expect(() =>
      compileTimeline(
        {
          ...definition,
          cues: [
            { id: 'one', atSeconds: 0, kind: 'camera', cameraId: 'lantern', durationSeconds: 1 },
            { id: 'two', atSeconds: 0.5, kind: 'camera', cameraId: 'game', durationSeconds: 0.5 },
          ],
        },
        registry,
      ),
    ).toThrow(/overlapping ownership/i);
    expect(() =>
      compileTimeline(
        {
          ...definition,
          cues: [
            { id: 'one', atSeconds: 0, kind: 'animation', actorId: 'guardian', action: 'interact' },
            { id: 'two', atSeconds: 0, kind: 'animation', actorId: 'guardian', action: 'combat' },
          ],
        },
        registry,
      ),
    ).toThrow(/overlapping ownership/i);
    expect(() =>
      compileTimeline(
        {
          ...definition,
          cues: [
            { id: 'one', atSeconds: 0, kind: 'audio', audioId: 'gentleChime' },
            { id: 'two', atSeconds: 0.1, kind: 'audio', audioId: 'gentleChime' },
          ],
        },
        registry,
      ),
    ).toThrow(/overlapping ownership/i);
    expect(() =>
      compileTimeline(
        {
          ...definition,
          cues: [
            {
              id: 'one',
              atSeconds: 0,
              kind: 'effect',
              effectId: 'lanternGlow',
              durationSeconds: 1,
            },
            {
              id: 'two',
              atSeconds: 0.5,
              kind: 'effect',
              effectId: 'lanternGlow',
              durationSeconds: 0.5,
            },
          ],
        },
        registry,
      ),
    ).toThrow(/overlapping ownership/i);
  });

  it('does not mutate authored definitions or expose mutable compiled registries', () => {
    const authored = structuredClone(definition);
    const registryCopy = structuredClone(registry);
    const compiled = compileTimeline(authored, registryCopy);
    const player = createTimelinePlayer(compiled);
    player.play();
    player.advance(0.3);
    expect(authored).toEqual(definition);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.cues)).toBe(true);
    expect(Object.isFrozen(compiled.registry.cameras.lantern)).toBe(true);
    expect(Object.isFrozen(compiled.registry.actors)).toBe(true);
  });
});
