import { AnimationMixer, LoopOnce, LoopRepeat } from 'three';
import type { AnimationAction, AnimationClip, Object3D } from 'three';
import type { ModelAssetRecord, SemanticAction } from './contracts.js';

export interface CharacterAnimationOptions {
  readonly crossFadeSeconds?: number;
  readonly invalidate?: () => void;
}

export interface CharacterAnimationSnapshot {
  readonly semanticAction: SemanticAction | null;
  readonly active: boolean;
  readonly mixerTimeSeconds: number;
  readonly actionTimeSeconds: number | null;
}

export interface CharacterAnimationController {
  snapshot(): CharacterAnimationSnapshot;
  /** Start a semantic clip. Idle repeats a bounded number of times for demand rendering. */
  setAction(action: SemanticAction, options?: { readonly reducedMotion?: boolean }): void;
  /** Advance only a currently active action; returns whether another frame is needed. */
  advance(deltaSeconds: number): boolean;
  dispose(): void;
}

const DEFAULT_CROSS_FADE_SECONDS = 0.12;
const IDLE_REPETITIONS = 2;

export function createCharacterAnimationController(
  root: Object3D,
  clips: readonly AnimationClip[],
  record: Pick<ModelAssetRecord, 'clips' | 'fallbackAction'>,
  options: CharacterAnimationOptions = {},
): CharacterAnimationController {
  const mixer = new AnimationMixer(root);
  const clipsByName = new Map(clips.map((clip) => [clip.name, clip]));
  const crossFadeSeconds = options.crossFadeSeconds ?? DEFAULT_CROSS_FADE_SECONDS;
  if (!Number.isFinite(crossFadeSeconds) || crossFadeSeconds < 0 || crossFadeSeconds > 2)
    throw new RangeError('Animation crossfade must be between zero and two seconds.');
  const invalidate = options.invalidate ?? (() => {});
  let current: AnimationAction | null = null;
  let currentSemantic: SemanticAction | null = null;
  let fadingOut: AnimationAction | null = null;
  let fadeElapsed = 0;
  let active = false;
  let disposed = false;

  const stopFadingOut = () => {
    fadingOut?.stop();
    fadingOut = null;
    fadeElapsed = 0;
  };

  function startAction(semanticAction: SemanticAction, reducedMotion: boolean): void {
    if (disposed) return;
    stopFadingOut();

    let resolvedAction: SemanticAction | null = semanticAction;
    let clipName = record.clips[semanticAction];
    let clip = clipName ? clipsByName.get(clipName) : undefined;
    if (!clip) {
      if (record.fallbackAction === 'idle') {
        clipName = record.clips.idle;
        clip = clipName ? clipsByName.get(clipName) : undefined;
        resolvedAction = clip ? 'idle' : null;
      } else {
        resolvedAction = null;
      }
    }
    if (!clip || !resolvedAction) {
      mixer.stopAllAction();
      current = null;
      currentSemantic = null;
      active = false;
      invalidate();
      return;
    }

    const previous = current;
    const next = mixer.clipAction(clip, root);
    next.enabled = true;
    next.paused = false;
    next.clampWhenFinished = true;
    const repeats = resolvedAction === 'idle';
    next.setLoop(repeats ? LoopRepeat : LoopOnce, repeats ? IDLE_REPETITIONS : 1);
    next.reset().play();

    if (reducedMotion) {
      // Stop prior actions before evaluating a static pose so an interrupted
      // crossfade cannot leave part of the old action blended into the result.
      mixer.stopAllAction();
      next.enabled = true;
      next.paused = false;
      next.clampWhenFinished = true;
      next.setLoop(LoopOnce, 1);
      next.reset().play();
      current = next;
      currentSemantic = resolvedAction;
      active = false;
      next.time = repeats ? 0 : clip.duration;
      mixer.update(0);
      next.paused = true;
      invalidate();
      return;
    }

    if (previous && previous !== next) {
      if (active && crossFadeSeconds > 0) {
        previous.crossFadeTo(next, crossFadeSeconds, false);
        fadingOut = previous;
        fadeElapsed = 0;
      } else {
        previous.stop();
      }
    }
    current = next;
    currentSemantic = resolvedAction;
    active = true;
    invalidate();
  }

  const onFinished = (event: { readonly action: AnimationAction }) => {
    if (event.action !== current) return;
    active = false;
    if (currentSemantic !== null && currentSemantic !== 'idle' && currentSemantic !== 'defeat') {
      startAction('idle', false);
      return;
    }
    invalidate();
  };
  mixer.addEventListener('finished', onFinished);

  return {
    snapshot() {
      return Object.freeze({
        semanticAction: currentSemantic,
        active,
        mixerTimeSeconds: mixer.time,
        actionTimeSeconds: current?.time ?? null,
      });
    },
    setAction(semanticAction, { reducedMotion = false } = {}) {
      startAction(semanticAction, reducedMotion);
    },
    advance(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
        throw new RangeError('Animation delta must be a finite non-negative number.');
      if (disposed || !active) return false;
      mixer.update(deltaSeconds);
      if (fadingOut) {
        fadeElapsed += deltaSeconds;
        if (fadeElapsed >= crossFadeSeconds) stopFadingOut();
      }
      if (active) invalidate();
      return active;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      mixer.removeEventListener('finished', onFinished);
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      current = null;
      currentSemantic = null;
      fadingOut = null;
    },
  };
}
