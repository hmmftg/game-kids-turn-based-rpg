// Scripted performance scenario for the ?perfprobe=1 instrumentation —
// boot → hub idle → walk → dialogue → encounter beats → cave transition and
// back, sampled per quality tier. Writes a raw JSON report + console table.
//
// Honest-metric contract (mirrored in docs/performance-baseline.md):
// - Frame interval = time between consecutive *rendered* frames from the
//   renderer's own timestamps; avg/p95 computed only inside marked
//   continuous-rendering windows. Demand-loop idle gaps are classified
//   separately, never reported as FPS.
// - `gl.info.render` is sampled post-submission by the probe (a useFrame
//   callback would read the *preceding* frame's counters).
// - performance.memory = JS heap, never GPU memory. SwiftShader numbers are
//   a repeatable regression baseline, NOT proof of low-end device GPU perf.
// Requires `npm run dev -- --port 5199` and chromium with SwiftShader.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  enableWorldProbe,
  expandTrail,
  mapId,
  setTier,
  tapNpcFigure,
  tapWorldAnchor,
  waitForMap,
  waitForProbe,
  waitForWalkerIdle,
} from './drive-world.ts';
import { getQuestDefinition } from '../src/domain/quests/definitions.ts';

const base = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]!
  : 'http://localhost:5199';
const out = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]!
  : 'docs/performance-baseline.raw.json';

const TIERS = ['low', 'medium', 'high'] as const;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
await enableWorldProbe(page);

interface PerfApi {
  mark(name: string): void;
  begin(name: string): void;
  end(): void;
  snapshot(): unknown;
}

const perfCall = (method: 'mark' | 'begin' | 'end', name?: string) =>
  page.evaluate(
    ([m, n]) => {
      const api = (window as unknown as { __perf?: PerfApi }).__perf;
      if (!api) throw new Error('__perf missing — was ?perfprobe=1 loaded?');
      if (m === 'end') api.end();
      else api[m](n!);
    },
    [method, name] as const,
  );

const mark = (name: string) => perfCall('mark', name);
const begin = (name: string) => perfCall('begin', name);
const end = () => perfCall('end');
const snapshot = () =>
  page.evaluate(() => (window as unknown as { __perfSnapshot: () => unknown }).__perfSnapshot());

// Boot → time-to-interactive (wall-clock, labeled as such).
const tBoot = Date.now();
await page.goto(`${base}?research=0&perfprobe=1`);
await page.waitForFunction(
  () => typeof (window as unknown as { __perf?: unknown }).__perf === 'object',
  undefined,
  { timeout: 15000 },
);
await page.getByTestId('start-button').waitFor();
const ttiMs = Date.now() - tBoot;
await mark('tti:start-button');

await page.getByTestId('start-button').click();
await page.getByTestId('avatar-aban').click();
await page.getByTestId('headwear-next').click();
await page.getByTestId('hud').waitFor();
await page.getByTestId('world-canvas').waitFor();
// The world probe publishes only once WorldCanvas mounts.
await waitForProbe(page);
const hubMs = Date.now() - tBoot;
await mark('hub:mounted');

const tiers: Record<string, unknown> = {};
// The probe's snapshot is cumulative (all spans/frames since install); slice
// each tier's report to the entries recorded during that tier only.
let prevWindows = 0;
let prevFrames = 0;
let prevLongtasks = 0;
for (const tier of TIERS) {
  await setTier(page, tier);
  await page.waitForTimeout(500);
  await mark(`tier:${tier}`);

  // Idle: mostly demand-loop gaps — exercises the idle classification.
  await begin('hub-idle');
  await page.waitForTimeout(3000);
  await end();

  // Walk: continuous rendering while the walker moves and the camera eases.
  await begin('walk');
  await expandTrail(page);
  await page.getByTestId('trail-quest-greeting').click();
  await waitForWalkerIdle(page);
  await end();

  // Dialogue open (figure tap — the only interaction-ownership route).
  const npcId = getQuestDefinition('quest-greeting').steps[0]!.npcId;
  await tapNpcFigure(page, npcId);
  await mark('dialogue:open');

  // Encounter beats: intro→demonstrate auto-play until the choice appears.
  await page.getByTestId('start-quest').click();
  await begin('encounter-beats');
  await page.getByTestId('scene-icon-greet').waitFor({ timeout: 15000 });
  await end();

  // Consequence: the object tap's truthful-scene animation + auto-advance.
  await begin('encounter-consequence');
  await page.getByTestId('scene-icon-greet').click();
  await page.getByTestId('scene-icon-smile').waitFor({ timeout: 15000 });
  await end();

  // Leave at step-2 intro — the quest stays incomplete so the scenario is
  // repeatable at the next tier.
  await page.getByTestId('leave-encounter').waitFor({ timeout: 15000 });
  await page.getByTestId('leave-encounter').click();
  await page.getByTestId('hud').waitFor();

  // Map transition: the first visit reveals the rock (no map change), the
  // second tap walks in. Later runs skip the reveal — the first tap then
  // transitions inside its own marked window.
  const before = await mapId(page);
  await tapWorldAnchor(page, 'anchor-cave-entrance');
  if ((await mapId(page)) === before) {
    await begin('map-transition-in');
    await tapWorldAnchor(page, 'anchor-cave-entrance');
    await waitForMap(page, 'map-cave');
    await end();
  }
  await mark('cave:entered');

  await begin('map-transition-out');
  await tapWorldAnchor(page, 'anchor-cave-mouth');
  await waitForMap(page, 'map-town');
  await end();
  await mark('cave:exited');

  const snap = (await snapshot()) as {
    windows: unknown[];
    frames: unknown[];
    longtasks: unknown[];
  };
  snap.windows = snap.windows.slice(prevWindows);
  snap.frames = snap.frames.slice(prevFrames);
  snap.longtasks = snap.longtasks.slice(prevLongtasks);
  prevWindows += snap.windows.length;
  prevFrames += snap.frames.length;
  prevLongtasks += snap.longtasks.length;
  tiers[tier] = snap;
}
await mark('scenario:done');

const report = {
  environment: {
    label: 'dev-server/headless-Chromium (SwiftShader)',
    url: base,
    viewport: '900x500',
    os: `${process.platform} ${process.arch}`,
    chromium: browser.version(),
    date: new Date().toISOString(),
    procedure:
      'start → avatar → per-tier: hub idle 3s, trail-chip walk, figure-tap dialogue, ' +
      'encounter demonstrate+consequence, leave at step 2, cave in/out',
  },
  timing: { ttiMs, hubMs },
  tiers,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));

// Console summary: avg/p95 active frame interval per window per tier.
console.log(`\nenvironment: ${report.environment.label} | chromium ${browser.version()}`);
console.log(`tti(start-button): ${ttiMs}ms | hub mounted: ${hubMs}ms`);
for (const tier of TIERS) {
  const snap = tiers[tier] as {
    windows: Array<{
      name: string;
      frames: number;
      activeIntervals: { count: number; avgMs: number | null; p95Ms: number | null };
      idleGaps: { count: number };
      calls: { avg: number | null; max: number | null };
      submitMs: { avg: number | null; p95: number | null };
      longtasks: { count: number };
    }>;
    heapBytes: number | null;
  };
  console.log(`\n[${tier}] heap=${snap.heapBytes ?? 'n/a'}`);
  for (const w of snap.windows) {
    const ai = w.activeIntervals;
    console.log(
      `  ${w.name}: frames=${w.frames} active=${ai.count} avg=${ai.avgMs?.toFixed(1) ?? '-'}ms ` +
        `p95=${ai.p95Ms?.toFixed(1) ?? '-'}ms idleGaps=${w.idleGaps.count} ` +
        `calls(avg/max)=${w.calls.avg?.toFixed(0) ?? '-'}/${w.calls.max ?? '-'} ` +
        `submit(avg/p95)=${w.submitMs.avg?.toFixed(1) ?? '-'}/${w.submitMs.p95?.toFixed(1) ?? '-'}ms ` +
        `longtasks=${w.longtasks.count}`,
    );
  }
}
await browser.close();
