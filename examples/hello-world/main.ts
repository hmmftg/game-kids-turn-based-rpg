import { createHelloRuntime } from './game.ts';
import { map, PROP_ANCHOR, worldSource } from './world.ts';
import { getAnchor, insideBounds } from '../../src/framework/index.ts';

/**
 * hello-world: the smallest consumer of the framework runtime. No React, no
 * Three, no game content — one prop, one bounded response. The runtime owns
 * state + dispatch + subscriptions; this file only wires DOM to commands.
 */

const runtime = createHelloRuntime();
const scene = document.querySelector<HTMLDivElement>('.scene')!;
const count = document.querySelector<HTMLDivElement>('[data-testid="count"]')!;

// The declared world is real structure the helpers resolve: the tappable
// prop sits on the one walkable anchor inside the map bounds.
const propAnchor = getAnchor(worldSource, PROP_ANCHOR.id);
if (!insideBounds(map.bounds, propAnchor.x, propAnchor.z)) {
  throw new Error('prop anchor outside bounds');
}

let settleTimer: ReturnType<typeof setTimeout> | null = null;

scene.querySelector('[data-testid="prop"]')!.addEventListener('click', () => {
  runtime.dispatch({ type: 'tap-prop' });
  // Bounded response: the cheer plays for ~1.2s, then the world settles.
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => runtime.dispatch({ type: 'settle' }), 1200);
});

runtime.subscribe((state) => {
  scene.dataset.phase = state.phase;
  count.textContent = String(state.taps);
});
