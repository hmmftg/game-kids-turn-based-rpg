import { describe, expect, it } from 'vitest';
import { createGameRuntime } from './game';
import { spawnAnchor, worldSource } from './world';

describe('generated one-scene game', () => {
  it('starts at its declared walkable spawn anchor', () => {
    expect(worldSource.anchors).toContain(spawnAnchor);
    expect(spawnAnchor.walkable).toBe(true);
  });

  it('runs an application-owned interaction through the core runtime', () => {
    const runtime = createGameRuntime();
    expect(runtime.getState()).toEqual({ interactions: 0 });
    runtime.dispatch({ type: 'interact-with-scene' });
    expect(runtime.getState()).toEqual({ interactions: 1 });
    runtime.dispose();
  });
});
