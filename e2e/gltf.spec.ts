import { expect, test, type Page } from '@playwright/test';
import { seedCompletedQuests } from './harness.ts';
import {
  enableWorldProbe,
  playerAt,
  reactionsProbe,
  tapReactivePoint,
  tapWorldAnchor,
  waitForWalkerIdle,
} from './npcTap.ts';

// GLB landmark tier gate: `modelsForTier` mounts the gltf ModelSet only on
// high/very-high — very-low through normal keep the cubic set and must never
// fetch a .glb. (normal was measured at ~99.6% of its triangle ceiling before
// GLBs — see modelsForTier.) The tier is seeded directly (the parent's
// persisted choice) because SwiftShader auto-detection lands on 'low', which
// would silently skip the GLB path these tests exist to cover.

interface SceneProbe {
  __worldScene?: {
    traverse: (fn: (o: { isMesh?: boolean; name?: string }) => void) => void;
  };
}

/** Mesh names currently mounted from the generated gltf components. */
async function glbMeshNames(page: Page) {
  return page.evaluate(() => {
    const scene = (window as unknown as SceneProbe).__worldScene;
    const names: string[] = [];
    scene?.traverse((o) => {
      // Vertex-color-baked GLBs mount a single mesh named after the source
      // node (see scripts/gen-gltf-component.ts + convert-model.ts --vcolor).
      if (
        o.isMesh &&
        o.name &&
        /^(house|market|well|ball|box_A|farm_plot|fence|pathCobbled|pathDirt|detail_|character_|mesh_0)/.test(
          o.name,
        )
      )
        names.push(o.name);
    });
    return names;
  });
}

/** Records every request whose URL ends in .glb for the spec's assertions. */
function watchGlbRequests(page: Page): () => string[] {
  const urls: string[] = [];
  page.on('request', (req) => {
    if (/\.glb(?:\?|$)/.test(req.url())) urls.push(req.url());
  });
  return () => urls;
}

test.describe('gltf landmarks', () => {
  test('lower tiers never initiate a GLB fetch', async ({ page }) => {
    await enableWorldProbe(page);
    const requested = watchGlbRequests(page);
    await seedCompletedQuests(page, [], 'low');
    await waitForWalkerIdle(page);
    // Even after a little navigation the cubic set stays in charge.
    expect(requested()).toEqual([]);
    expect(await glbMeshNames(page)).toEqual([]);
  });

  test('high and very-high tiers load exactly the committed GLBs and mount them', async ({
    page,
  }) => {
    await enableWorldProbe(page);
    const requested = watchGlbRequests(page);
    await seedCompletedQuests(page, [], 'high');
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
    const urls = requested().map((u) => new URL(u).pathname.split('/').pop());
    // Landmarks + bakery crate + ambient duck/dog + the town/fountain rocks
    // scenery slots mount eagerly at the town spawn; the farm plot is
    // very-high only (triangle ceiling), Sara's ball and the park/river/
    // school trees stay lazy until their areas are visible.
    expect(new Set(urls)).toEqual(
      new Set([
        'home-gate.glb',
        'shop.glb',
        'fountain.glb',
        'crate.glb',
        'duck.glb',
        'dog.glb',
        'rocks.glb',
      ]),
    );
    const names = await glbMeshNames(page);
    // node names post-vertex-bake: house, market, well — one mesh each
    expect(names).toContain('house');
    expect(names).toContain('market');
    expect(names).toContain('well');
    // crate → box_A; mini-game characters → character_duck/character_dog
    expect(names).toContain('box_A');
    expect(names).toContain('character_duck');
    expect(names).toContain('character_dog');
    // two authored rocks slots share rocks.glb — one fetch, two mounts
    expect(names.filter((n) => n === 'detail_rocks').length).toBe(2);
    // the garden's farm plot keeps its cubic form on high (see minDetail)
    expect(names).not.toContain('farm_plot');
  });

  test('very-high upgrades the farm plot and garden fence to their GLBs', async ({ page }) => {
    await enableWorldProbe(page);
    const requested = watchGlbRequests(page);
    await seedCompletedQuests(page, [], 'very-high');
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
    const urls = requested().map((u) => new URL(u).pathname.split('/').pop());
    // both top-tier scenery GLBs in spawn-visible areas (garden), plus the
    // koi — the fish GLB is very-high only (522 tris over high's headroom).
    expect(urls).toContain('farm-plot.glb');
    expect(urls).toContain('fence.glb');
    expect(urls).toContain('koi.glb');
    const names = await glbMeshNames(page);
    expect(names).toContain('farm_plot');
    expect(names).toContain('fence');
    // both fountain koi mount the shared mesh_0 node — one fetch, two mounts
    expect(names.filter((n) => n === 'mesh_0').length).toBe(2);
  });

  test('the glb home-gate door still answers a knock with door-swing', async ({ page }) => {
    await enableWorldProbe(page);
    await seedCompletedQuests(page, [], 'high');
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
    // Approach via the path, not the gate anchor itself: npc-neighbour
    // shares anchor-home-gate, so anchor taps resolve as figure taps and the
    // helper would spin on dialogue dismissals past the test timeout.
    await tapWorldAnchor(page, 'anchor-path-north');
    await waitForWalkerIdle(page);

    // The proxy slab stands on the model's door: world (-0.68, 0.31, -6.68)
    // — the tap surface of `reactive-door-home-gate`, kept by the adapter
    // because the GLB mesh itself has no door node and is raycast-inert.
    await tapReactivePoint(page, -0.68, -6.68, 0.31);
    await page.waitForTimeout(300);
    const reactions = await reactionsProbe(page);
    expect(
      reactions.some((r) => r.reaction === 'door-swing' && r.subject === 'door-home-gate'),
    ).toBe(true);
    await waitForWalkerIdle(page);
    expect(await playerAt(page)).toBe('anchor-home-gate');
  });

  test('the glb fountain still bloops and the tap keeps walking', async ({ page }) => {
    await enableWorldProbe(page);
    await seedCompletedQuests(page, [], 'high');
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
    await tapWorldAnchor(page, 'anchor-path-west');
    await waitForWalkerIdle(page);

    await tapReactivePoint(page, -6, -2.0);
    await page.waitForTimeout(300);
    expect(
      (await reactionsProbe(page)).some((r) => r.reaction === 'bloop' && r.subject === 'fountain'),
    ).toBe(true);
  });

  test('a canvas remount keeps the shared GLB geometry alive', async ({ page }) => {
    await enableWorldProbe(page);
    await seedCompletedQuests(page, [], 'high');
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);

    // Pause unmounts the whole <Canvas> (AGENTS §5); resuming remounts it.
    // GLB geometries/materials are shared `useGLTF` cache objects under
    // `dispose={null}` — they must not have been disposed with the old
    // scene, so the meshes mount again cleanly.
    await page.getByTestId('pause-button').click();
    await expect(page.getByTestId('resume-button')).toBeVisible();
    await page.getByTestId('resume-button').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await waitForWalkerIdle(page);
    await expect
      .poll(async () => (await glbMeshNames(page)).length, { timeout: 15000 })
      .toBeGreaterThan(0);
  });
});
