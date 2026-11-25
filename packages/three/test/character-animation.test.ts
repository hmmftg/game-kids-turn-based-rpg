import { AnimationClip, Bone, Group, VectorKeyframeTrack } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createCharacterAnimationController } from '../src/character-animation.js';
import type { ModelAssetRecord, SemanticAction } from '../src/contracts.js';

const assetRecord = {
  clips: {
    idle: 'Idle',
    move: 'Move',
    interact: 'Interact',
    combat: 'Combat',
  },
  fallbackAction: 'idle',
} as Pick<ModelAssetRecord, 'clips' | 'fallbackAction'>;

function character() {
  const root = new Group();
  const joint = new Bone();
  joint.name = 'Character root joint';
  root.add(joint);
  return { root, joint };
}

function clips(): AnimationClip[] {
  return [
    new AnimationClip('Idle', 1, [
      new VectorKeyframeTrack('Character root joint.position', [0, 1], [0, 0, 0, 0, 0, 0]),
    ]),
    new AnimationClip('Move', 1, [
      new VectorKeyframeTrack('Character root joint.position', [0, 1], [0, 0, 0, 1, 0, 0]),
    ]),
    new AnimationClip('Interact', 1, [
      new VectorKeyframeTrack('Character root joint.position', [0, 1], [0, 0, 0, 0, 1, 0]),
    ]),
    new AnimationClip('Combat', 1, [
      new VectorKeyframeTrack('Character root joint.position', [0, 1], [0, 0, 0, 0, 0, 1]),
    ]),
  ];
}

describe('character animation controller', () => {
  it('advances two character instances on independent mixer clocks', () => {
    const first = character();
    const second = character();
    const a = createCharacterAnimationController(first.root, clips(), assetRecord);
    const b = createCharacterAnimationController(second.root, clips(), assetRecord);

    a.setAction('move');
    b.setAction('interact');
    expect(a.advance(0.25)).toBe(true);
    expect(first.joint.position.x).toBeCloseTo(0.25, 2);
    expect(second.joint.position.y).toBe(0);

    expect(b.advance(0.1)).toBe(true);
    expect(second.joint.position.y).toBeCloseTo(0.1, 2);
    expect(first.joint.position.y).toBe(0);

    a.dispose();
    b.dispose();
  });

  it('exposes a read-only per-instance mixer snapshot for lifecycle diagnostics', () => {
    const first = character();
    const second = character();
    const a = createCharacterAnimationController(first.root, clips(), assetRecord);
    const b = createCharacterAnimationController(second.root, clips(), assetRecord);

    a.setAction('move');
    b.setAction('interact');
    a.advance(0.2);
    const firstSnapshot = a.snapshot();
    const secondSnapshot = b.snapshot();

    expect(firstSnapshot).toMatchObject({ semanticAction: 'move', active: true });
    expect(firstSnapshot.actionTimeSeconds).toBeCloseTo(0.2, 2);
    expect(secondSnapshot).toMatchObject({ semanticAction: 'interact', active: true });
    expect(secondSnapshot.actionTimeSeconds).toBe(0);
    expect(Object.isFrozen(firstSnapshot)).toBe(true);

    a.dispose();
    expect(a.snapshot()).toMatchObject({
      semanticAction: null,
      active: false,
      actionTimeSeconds: null,
    });
    b.dispose();
  });
  it('interrupts a running action with a new semantic action', () => {
    const actor = character();
    const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
      crossFadeSeconds: 0,
    });

    controller.setAction('move');
    controller.advance(0.2);
    expect(actor.joint.position.x).toBeCloseTo(0.2, 2);

    controller.setAction('combat');
    controller.advance(0.2);
    expect(actor.joint.position.z).toBeCloseTo(0.2, 2);
    expect(controller.advance(1.1)).toBe(true);
    expect(controller.advance(2.1)).toBe(false);
    controller.dispose();
  });

  it('crossfades the outgoing action and then releases it', () => {
    const actor = character();
    const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
      crossFadeSeconds: 0.25,
    });

    controller.setAction('move');
    controller.advance(0.2);
    controller.setAction('combat');
    expect(controller.advance(0.1)).toBe(true);
    expect(actor.joint.position.x).toBeGreaterThan(0);
    expect(controller.advance(0.2)).toBe(true);
    expect(actor.joint.position.x).toBeCloseTo(0, 2);
    controller.dispose();
  });

  it('uses the registered idle fallback for missing actions', () => {
    const actor = character();
    const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
      crossFadeSeconds: 0,
    });

    controller.setAction('defeat');
    controller.advance(0.15);
    expect(actor.joint.position.toArray()).toEqual([0, 0, 0]);

    controller.dispose();
  });

  it('uses a static pose when the registered fallback is static', () => {
    const actor = character();
    const staticFallbackRecord = {
      clips: { idle: 'Idle', move: 'Move' },
      fallbackAction: 'static',
    } as Pick<ModelAssetRecord, 'clips' | 'fallbackAction'>;
    const controller = createCharacterAnimationController(
      actor.root,
      clips(),
      staticFallbackRecord,
      { crossFadeSeconds: 0 },
    );

    controller.setAction('defeat');

    expect(controller.advance(0.25)).toBe(false);
    expect(actor.joint.position.toArray()).toEqual([0, 0, 0]);
    controller.dispose();
  });

  it('maps semantic actions by stable IDs when original source clip names are blank or duplicated', () => {
    const actor = character();
    const sourceClips = [
      new AnimationClip('', 1, [
        new VectorKeyframeTrack('Character root joint.position', [0, 1], [0, 0, 0, 0, 1, 0]),
      ]),
      new AnimationClip('Walk', 1, [
        new VectorKeyframeTrack('Character root joint.position', [0, 1], [0, 0, 0, 1, 0, 0]),
      ]),
      new AnimationClip('Walk', 1, [
        new VectorKeyframeTrack('Character root joint.position', [0, 1], [0, 0, 0, 0, 0, 1]),
      ]),
    ];
    const indexedRecord = {
      clips: { idle: 'clip-1', move: 'clip-3' },
      fallbackAction: 'idle',
    } as Pick<ModelAssetRecord, 'clips' | 'fallbackAction'>;
    const controller = createCharacterAnimationController(actor.root, sourceClips, indexedRecord, {
      crossFadeSeconds: 0,
    });

    controller.setAction('move');
    controller.advance(0.5);
    expect(actor.joint.position.z).toBeCloseTo(0.5, 2);
    controller.setAction('interact');
    controller.advance(0.25);
    expect(actor.joint.position.y).toBeCloseTo(0.25, 2);

    controller.dispose();
  });

  it('applies reduced-motion poses immediately without scheduling mixer frames', () => {
    const actor = character();
    const invalidate = vi.fn();
    const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
      crossFadeSeconds: 0.2,
      invalidate,
    });

    controller.setAction('move', { reducedMotion: true });
    expect(actor.joint.position.x).toBe(1);
    expect(controller.advance(0.5)).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  it('repeats idle for a bounded period and then settles for demand rendering', () => {
    const actor = character();
    const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
      crossFadeSeconds: 0,
    });

    controller.setAction('idle');
    expect(controller.advance(1.1)).toBe(true);
    expect(controller.advance(0.8)).toBe(true);
    expect(controller.advance(0.2)).toBe(false);
    controller.dispose();
  });

  it.each(['move', 'interact', 'combat'] as const)(
    'returns from %s to idle after the one-shot completes',
    (action) => {
      const actor = character();
      const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
        crossFadeSeconds: 0,
      });

      controller.setAction(action);
      expect(controller.advance(1.1)).toBe(true);
      expect(controller.advance(0.1)).toBe(true);
      expect(actor.joint.position.toArray()).toEqual([0, 0, 0]);
      expect(controller.advance(1.95)).toBe(false);
      controller.dispose();
    },
  );

  it('interrupts a crossfade immediately when reduced motion is enabled', () => {
    const actor = character();
    const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
      crossFadeSeconds: 0.25,
    });

    controller.setAction('move');
    controller.advance(0.2);
    controller.setAction('combat', { reducedMotion: true });

    expect(controller.advance(0.1)).toBe(false);
    expect(actor.joint.position.toArray()).toEqual([0, 0, 1]);
    controller.dispose();
  });

  it('settles one-shot clips, skips unknown mappings, and disposes idempotently', () => {
    const actor = character();
    const invalidate = vi.fn();
    const controller = createCharacterAnimationController(actor.root, clips(), assetRecord, {
      crossFadeSeconds: 0,
      invalidate,
    });

    controller.setAction('move' satisfies SemanticAction);
    expect(controller.advance(1.1)).toBe(true);
    expect(controller.advance(2.1)).toBe(false);
    expect(controller.advance(0.1)).toBe(false);
    controller.dispose();
    controller.dispose();
    const invalidationsAfterDisposal = invalidate.mock.calls.length;
    expect(controller.advance(1)).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(invalidationsAfterDisposal);
  });
});
