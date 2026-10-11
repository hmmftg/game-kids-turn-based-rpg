import { describe, expect, it } from 'vitest';
import { createHelloRuntime, HelloMemoryPersistence } from './game.ts';
import { PROP_ANCHOR, worldSource } from './world.ts';
import { getAnchor, insideBounds } from '../../src/framework/index.ts';
import { map } from './world.ts';

/**
 * API contract coverage from the consumer's side: the framework runtime
 * drives a foreign state machine end to end — init, dispatch, clock,
 * subscriptions, pause/resume, dispose — with no game types involved.
 */
describe('hello-world runtime contract', () => {
  it('initializes with the adapter state and stamps the injected clock', () => {
    const runtime = createHelloRuntime(() => 42);
    expect(runtime.getState()).toEqual({ phase: 'idle', taps: 0, lastTapAt: 0 });
    runtime.dispatch({ type: 'tap-prop' });
    expect(runtime.getState()).toEqual({ phase: 'celebrated', taps: 1, lastTapAt: 42 });
  });

  it('publishes through subscriptions; pause suspends, resume flushes once', () => {
    const runtime = createHelloRuntime(() => 7);
    const seen: string[] = [];
    runtime.subscribe((state) => seen.push(state.phase));
    runtime.dispatch({ type: 'tap-prop' });
    runtime.pause();
    runtime.dispatch({ type: 'settle' });
    runtime.dispatch({ type: 'tap-prop' });
    expect(seen).toEqual(['celebrated']);
    runtime.resume();
    expect(seen).toEqual(['celebrated', 'celebrated']);
    expect(runtime.getState().taps).toBe(2);
  });

  it('dispose stops notifications and dispatch becomes a no-op', () => {
    const runtime = createHelloRuntime();
    const seen: string[] = [];
    runtime.subscribe((state) => seen.push(state.phase));
    runtime.dispose();
    runtime.dispatch({ type: 'tap-prop' });
    expect(seen).toEqual([]);
    expect(runtime.getState().phase).toBe('idle');
  });

  it('resolves its declared world through the shared graph helpers', () => {
    const anchor = getAnchor(worldSource, PROP_ANCHOR.id);
    expect(anchor.walkable).toBe(true);
    expect(insideBounds(map.bounds, anchor.x, anchor.z)).toBe(true);
  });

  it('round-trips a scoped save through memory persistence', async () => {
    const persistence = new HelloMemoryPersistence();
    const scope = { slotKey: 'slot-1' };
    expect((await persistence.load(scope)).kind).toBe('empty');
    await persistence.save({ taps: 3 }, scope);
    const result = await persistence.load(scope);
    expect(result).toEqual({ kind: 'loaded', data: { taps: 3 } });
    expect(persistence.onFailure({ kind: 'unavailable' })).toEqual({
      kind: 'memory',
      authoritative: false,
    });
  });
});
