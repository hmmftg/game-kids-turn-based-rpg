import type { SemanticAction } from '../animation/contracts.js';

export interface TimelineCameraPreset {
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
}

export interface TimelineDialogueRecord {
  readonly text: string;
  readonly locale?: string;
}

export interface TimelineAudioRecord {
  readonly durationSeconds: number;
  readonly channel: string;
}

export interface TimelineEffectRecord {
  readonly ownerId: string;
}

/** Game-owned registries keep authored timelines declarative and JSON-compatible. */
export interface TimelineRegistry {
  readonly cameras: Readonly<Record<string, TimelineCameraPreset>>;
  readonly actors: readonly string[];
  readonly dialogues: Readonly<Record<string, TimelineDialogueRecord>>;
  readonly effects: Readonly<Record<string, TimelineEffectRecord>>;
  readonly audio: Readonly<Record<string, TimelineAudioRecord>>;
}

interface CueBase {
  readonly id: string;
  readonly atSeconds: number;
}

export type TimelineCue =
  | (CueBase & {
      readonly kind: 'camera';
      readonly cameraId: string;
      readonly durationSeconds: number;
    })
  | (CueBase & {
      readonly kind: 'animation';
      readonly actorId: string;
      readonly action: SemanticAction;
    })
  | (CueBase & { readonly kind: 'dialogue'; readonly dialogueId: string })
  | (CueBase & { readonly kind: 'audio'; readonly audioId: string })
  | (CueBase & {
      readonly kind: 'effect';
      readonly effectId: string;
      readonly durationSeconds: number;
    })
  | (CueBase & {
      readonly kind: 'wait';
      readonly waitId: string;
      readonly mode: 'continue' | 'choice';
      readonly choiceIds?: readonly string[];
    });

export interface TimelineDefinition {
  readonly id: string;
  readonly version: number;
  readonly durationSeconds: number;
  readonly cues: readonly TimelineCue[];
}

export interface CompiledTimeline {
  readonly id: string;
  readonly version: 1;
  readonly durationSeconds: number;
  readonly cues: readonly TimelineCue[];
  readonly registry: TimelineRegistry;
}

export type TimelineStatus =
  'idle' | 'playing' | 'waiting' | 'completed' | 'cancelled' | 'disposed';

export interface TimelineSnapshot {
  readonly status: TimelineStatus;
  readonly timeSeconds: number;
  readonly executionId: number;
  readonly waitingFor: string | null;
  readonly reducedMotion: boolean;
}

export interface TimelineEvent {
  readonly executionId: number;
  readonly cue: TimelineCue;
}

export interface TimelineWaitResolution {
  readonly executionId: number;
  readonly waitId: string;
  readonly choiceId: string | null;
}

export interface TimelinePlayer {
  snapshot(): TimelineSnapshot;
  isCurrentExecution(executionId: number): boolean;
  play(options?: { readonly reducedMotion?: boolean }): number;
  skip(executionId: number): readonly TimelineEvent[];
  cancel(executionId: number): void;
  replay(options?: { readonly reducedMotion?: boolean }): number;
  resolveWait(
    executionId: number,
    waitId: string,
    choiceId?: string,
  ): TimelineWaitResolution | null;
  /** Advance deterministic time and return registered cues whose time has arrived. */
  advance(executionId: number, deltaSeconds: number): readonly TimelineEvent[];
  dispose(): void;
}

function nonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
}

function finiteVector(value: readonly number[]): value is readonly [number, number, number] {
  return value.length === 3 && value.every(Number.isFinite);
}

function cloneAndFreezeRegistry(registry: TimelineRegistry): TimelineRegistry {
  const cameras = Object.fromEntries(
    Object.entries(registry.cameras).map(([id, camera]) => [
      id,
      Object.freeze({
        position: Object.freeze([...camera.position]) as readonly [number, number, number],
        lookAt: Object.freeze([...camera.lookAt]) as readonly [number, number, number],
      }),
    ]),
  );
  const dialogues = Object.fromEntries(
    Object.entries(registry.dialogues).map(([id, dialogue]) => [
      id,
      Object.freeze({ ...dialogue }),
    ]),
  );
  const effects = Object.fromEntries(
    Object.entries(registry.effects).map(([id, effect]) => [id, Object.freeze({ ...effect })]),
  );
  const audio = Object.fromEntries(
    Object.entries(registry.audio).map(([id, record]) => [id, Object.freeze({ ...record })]),
  );
  return Object.freeze({
    cameras: Object.freeze(cameras),
    actors: Object.freeze([...registry.actors]),
    dialogues: Object.freeze(dialogues),
    effects: Object.freeze(effects),
    audio: Object.freeze(audio),
  });
}

function validateRegistry(registry: TimelineRegistry): void {
  if (!registry || typeof registry !== 'object') throw new Error('Timeline registry is required.');
  for (const [id, camera] of Object.entries(registry.cameras)) {
    if (
      !nonEmptyId(id) ||
      !camera ||
      !finiteVector(camera.position) ||
      !finiteVector(camera.lookAt)
    )
      throw new Error(`Timeline camera registry entry is invalid (${id}).`);
  }
  if (
    !Array.isArray(registry.actors) ||
    registry.actors.some((id) => !nonEmptyId(id)) ||
    new Set(registry.actors).size !== registry.actors.length
  )
    throw new Error('Timeline actor registry contains invalid or duplicate IDs.');
  for (const [id, dialogue] of Object.entries(registry.dialogues)) {
    if (
      !nonEmptyId(id) ||
      !dialogue ||
      typeof dialogue.text !== 'string' ||
      dialogue.text.trim() === '' ||
      dialogue.text.length > 1000 ||
      (dialogue.locale !== undefined && !nonEmptyId(dialogue.locale))
    )
      throw new Error(`Timeline dialogue registry entry is invalid (${id}).`);
  }
  for (const [id, effect] of Object.entries(registry.effects)) {
    if (!nonEmptyId(id) || !effect || !nonEmptyId(effect.ownerId))
      throw new Error(`Timeline effect registry entry is invalid (${id}).`);
  }
  for (const [id, audio] of Object.entries(registry.audio)) {
    if (
      !nonEmptyId(id) ||
      !audio ||
      !Number.isFinite(audio.durationSeconds) ||
      audio.durationSeconds <= 0 ||
      audio.durationSeconds > 30 ||
      !nonEmptyId(audio.channel)
    )
      throw new Error(`Timeline audio registry entry is invalid (${id}).`);
  }
}

function validateCue(cue: TimelineCue, registry: TimelineRegistry, durationSeconds: number): void {
  if (!cue || typeof cue !== 'object' || !nonEmptyId(cue.id))
    throw new Error('Timeline cue must have a non-empty stable ID.');
  if (!Number.isFinite(cue.atSeconds) || cue.atSeconds < 0 || cue.atSeconds > durationSeconds)
    throw new Error(`Timeline cue time is outside the timeline (${cue.id}).`);

  switch (cue.kind) {
    case 'camera':
      if (!Object.hasOwn(registry.cameras, cue.cameraId))
        throw new Error(`Timeline camera cue has an unknown camera (${cue.id}).`);
      if (
        !Number.isFinite(cue.durationSeconds) ||
        cue.durationSeconds < 0 ||
        cue.durationSeconds > 30 ||
        cue.atSeconds + cue.durationSeconds > durationSeconds
      )
        throw new Error(`Timeline camera cue duration is invalid (${cue.id}).`);
      break;
    case 'animation':
      if (!registry.actors.includes(cue.actorId))
        throw new Error(`Timeline animation cue has an unknown actor (${cue.id}).`);
      if (!['idle', 'move', 'interact', 'combat', 'defeat'].includes(cue.action))
        throw new Error(`Timeline animation cue has an invalid semantic action (${cue.id}).`);
      break;
    case 'dialogue':
      if (!Object.hasOwn(registry.dialogues, cue.dialogueId))
        throw new Error(`Timeline dialogue cue has an unknown dialogue (${cue.id}).`);
      break;
    case 'audio':
      if (!Object.hasOwn(registry.audio, cue.audioId))
        throw new Error(`Timeline audio cue has an unknown audio cue (${cue.id}).`);
      if (cue.atSeconds + registry.audio[cue.audioId]!.durationSeconds > durationSeconds)
        throw new Error(`Timeline audio cue exceeds the sequence duration (${cue.id}).`);
      break;
    case 'effect':
      if (!Object.hasOwn(registry.effects, cue.effectId))
        throw new Error(`Timeline effect cue has an unknown effect (${cue.id}).`);
      if (
        !Number.isFinite(cue.durationSeconds) ||
        cue.durationSeconds <= 0 ||
        cue.durationSeconds > 30 ||
        cue.atSeconds + cue.durationSeconds > durationSeconds
      )
        throw new Error(`Timeline effect cue duration is invalid (${cue.id}).`);
      break;
    case 'wait':
      if (!nonEmptyId(cue.waitId))
        throw new Error(`Timeline wait cue has an invalid ID (${cue.id}).`);
      if (cue.mode === 'continue' && cue.choiceIds !== undefined)
        throw new Error(`Continue wait cannot define choices (${cue.id}).`);
      if (cue.mode === 'choice') {
        if (
          !Array.isArray(cue.choiceIds) ||
          cue.choiceIds.length < 2 ||
          cue.choiceIds.length > 4 ||
          cue.choiceIds.some((id) => !nonEmptyId(id)) ||
          new Set(cue.choiceIds).size !== cue.choiceIds.length
        )
          throw new Error(
            `Timeline choice wait must have two to four unique choice IDs (${cue.id}).`,
          );
      }
      break;
    default:
      throw new Error('Timeline cue kind is not supported.');
  }
}

function cueSpan(
  cue: TimelineCue,
  registry: TimelineRegistry,
): readonly [number, number, string] | null {
  switch (cue.kind) {
    case 'camera':
      return [cue.atSeconds, cue.atSeconds + cue.durationSeconds, 'camera'];
    case 'dialogue':
      return [cue.atSeconds, cue.atSeconds, 'dialogue'];
    case 'audio': {
      const record = registry.audio[cue.audioId]!;
      return [cue.atSeconds, cue.atSeconds + record.durationSeconds, `audio:${record.channel}`];
    }
    case 'effect': {
      const record = registry.effects[cue.effectId]!;
      return [cue.atSeconds, cue.atSeconds + cue.durationSeconds, `effect:${record.ownerId}`];
    }
    case 'animation':
      return [cue.atSeconds, cue.atSeconds, `actor:${cue.actorId}`];
    case 'wait':
      return null;
  }
}

export function compileTimeline(
  definition: TimelineDefinition,
  sourceRegistry: TimelineRegistry,
): CompiledTimeline {
  if (!definition || !nonEmptyId(definition.id) || definition.version !== 1)
    throw new Error('Timeline definition has an invalid ID or unsupported version.');
  if (
    !Number.isFinite(definition.durationSeconds) ||
    definition.durationSeconds <= 0 ||
    definition.durationSeconds > 120
  )
    throw new Error('Timeline duration must be greater than zero and at most 120 seconds.');
  if (!Array.isArray(definition.cues) || definition.cues.length > 128)
    throw new Error('Timeline cues must be an array of at most 128 cues.');
  validateRegistry(sourceRegistry);
  const registry = cloneAndFreezeRegistry(sourceRegistry);

  const cueIds = new Set<string>();
  const waitIds = new Set<string>();
  const cues = definition.cues.map((cue, index) => {
    validateCue(cue, registry, definition.durationSeconds);
    if (cueIds.has(cue.id)) throw new Error(`Timeline cue ID is duplicated (${cue.id}).`);
    cueIds.add(cue.id);
    if (cue.kind === 'wait') {
      if (waitIds.has(cue.waitId))
        throw new Error(`Timeline wait ID is duplicated (${cue.waitId}).`);
      waitIds.add(cue.waitId);
    }
    if (index > 0 && cue.atSeconds < definition.cues[index - 1]!.atSeconds)
      throw new Error(`Timeline cue order is invalid (${cue.id}).`);
    return Object.freeze(structuredClone(cue));
  });

  const spans = cues
    .map((cue) => cueSpan(cue, registry))
    .filter((span): span is readonly [number, number, string] => span !== null)
    .sort((left, right) => left[0] - right[0]);
  const lastSpanByOwner = new Map<string, readonly [number, number]>();
  for (const current of spans) {
    const previous = lastSpanByOwner.get(current[2]);
    const pointCollision =
      previous !== undefined &&
      current[0] === previous[0] &&
      current[0] === current[1] &&
      previous[0] === previous[1];
    if (previous && (current[0] < previous[1] || pointCollision))
      throw new Error(`Timeline cues have overlapping ownership (${current[2]}).`);
    if (!previous || current[1] > previous[1])
      lastSpanByOwner.set(current[2], [current[0], current[1]]);
  }

  return Object.freeze({
    id: definition.id,
    version: 1,
    durationSeconds: definition.durationSeconds,
    cues: Object.freeze(cues),
    registry,
  });
}

export function createTimelinePlayer(timeline: CompiledTimeline): TimelinePlayer {
  let status: TimelineStatus = 'idle';
  let timeSeconds = 0;
  let nextCueIndex = 0;
  let executionId = 0;
  let reducedMotion = false;
  let waitingFor: string | null = null;
  let activeWait: Extract<TimelineCue, { kind: 'wait' }> | null = null;

  const snapshot = (): TimelineSnapshot =>
    Object.freeze({ status, timeSeconds, executionId, waitingFor, reducedMotion });
  const eventFor = (cue: TimelineCue): TimelineEvent => Object.freeze({ executionId, cue });

  const takeCuesThrough = (time: number): TimelineEvent[] => {
    const events: TimelineEvent[] = [];
    while (nextCueIndex < timeline.cues.length && timeline.cues[nextCueIndex]!.atSeconds <= time) {
      const cue = timeline.cues[nextCueIndex++]!;
      if (cue.kind === 'wait') {
        activeWait = cue;
        waitingFor = cue.waitId;
        timeSeconds = cue.atSeconds;
        status = 'waiting';
        events.push(eventFor(cue));
        break;
      }
      events.push(eventFor(cue));
    }
    return events;
  };

  const ensureNotDisposed = () => {
    if (status === 'disposed') throw new Error('Timeline player has been disposed.');
  };
  const isActiveExecution = (id: number) =>
    id === executionId && (status === 'playing' || status === 'waiting');
  const startExecution = (options: { readonly reducedMotion?: boolean } = {}) => {
    ensureNotDisposed();
    executionId += 1;
    status = 'playing';
    timeSeconds = 0;
    nextCueIndex = 0;
    waitingFor = null;
    activeWait = null;
    reducedMotion = options.reducedMotion ?? false;
    return executionId;
  };

  const player: TimelinePlayer = {
    snapshot,
    isCurrentExecution(id) {
      return id === executionId && status !== 'cancelled' && status !== 'disposed';
    },
    play(options = {}) {
      ensureNotDisposed();
      if (status === 'playing' || status === 'waiting') return executionId;
      return startExecution(options);
    },
    skip(id) {
      ensureNotDisposed();
      if (!isActiveExecution(id)) return [];
      const events: TimelineEvent[] = [];
      if (activeWait?.mode === 'choice') return [];
      activeWait = null;
      waitingFor = null;
      status = 'playing';
      while (nextCueIndex < timeline.cues.length) {
        const cue = timeline.cues[nextCueIndex++]!;
        if (cue.kind === 'wait' && cue.mode === 'choice') {
          activeWait = cue;
          waitingFor = cue.waitId;
          status = 'waiting';
          events.push(eventFor(cue));
          timeSeconds = cue.atSeconds;
          return Object.freeze(events);
        }
        if (cue.kind === 'dialogue') events.push(eventFor(cue));
      }
      timeSeconds = timeline.durationSeconds;
      status = 'completed';
      return Object.freeze(events);
    },
    cancel(id) {
      if (!isActiveExecution(id)) return;
      status = 'cancelled';
      waitingFor = null;
      activeWait = null;
    },
    replay(options = {}) {
      return startExecution(options);
    },
    resolveWait(id, waitId, choiceId) {
      if (!isActiveExecution(id) || status !== 'waiting' || activeWait?.waitId !== waitId)
        return null;
      if (activeWait.mode === 'continue' && choiceId !== undefined) return null;
      if (activeWait.mode === 'choice' && (!choiceId || !activeWait.choiceIds?.includes(choiceId)))
        return null;
      const resolution = Object.freeze({ executionId, waitId, choiceId: choiceId ?? null });
      activeWait = null;
      waitingFor = null;
      status = 'playing';
      return resolution;
    },
    advance(id, deltaSeconds) {
      ensureNotDisposed();
      if (!isActiveExecution(id)) return [];
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
        throw new RangeError('Timeline delta must be finite and non-negative.');
      if (status !== 'playing') return [];
      const targetTime = reducedMotion
        ? timeline.durationSeconds
        : Math.min(timeline.durationSeconds, timeSeconds + deltaSeconds);
      const events = takeCuesThrough(targetTime);
      if (status === 'playing') timeSeconds = targetTime;
      if (status === 'playing' && timeSeconds >= timeline.durationSeconds) status = 'completed';
      return Object.freeze(events);
    },
    dispose() {
      if (status === 'disposed') return;
      executionId += 1;
      status = 'disposed';
      waitingFor = null;
      activeWait = null;
      nextCueIndex = timeline.cues.length;
    },
  };
  return player;
}
