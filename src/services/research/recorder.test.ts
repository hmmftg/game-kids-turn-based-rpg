import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetResearchForTest,
  isResearchActive,
  record,
  recordWorldTap,
  researchSessionId,
  startResearchSession,
} from './recorder.ts';
import { clearResearchEvents, readResearchEvents } from './queue.ts';

// jsdom lacks indexedDB → the queue exercises its memory-buffer path, which is
// exactly the session-only posture the contract demands when storage fails.

const start = () => startResearchSession({ ageBand: '5-7', mode: 'normal', reducedMotion: false });

const types = async () => (await readResearchEvents()).map((e) => e.event);

describe('research recorder (PR R+)', () => {
  beforeEach(async () => {
    __resetResearchForTest();
    await clearResearchEvents();
    vi.restoreAllMocks();
  });

  it('is inert until a parent starts a session — record() is a no-op', async () => {
    record('found_npc', { npcId: 'npc-elder' });
    recordWorldTap(1, 2, null);
    expect(await readResearchEvents()).toHaveLength(0);
    expect(isResearchActive()).toBe(false);
  });

  it('starting a session emits started_game and stamps context defaults', async () => {
    const session = start();
    expect(isResearchActive()).toBe(true);
    expect(session.sessionId).toBe(researchSessionId());
    const events = await readResearchEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe('started_game');
    expect(events[0]!.sessionId).toBe(session.sessionId);
    expect(events[0]!.context).toMatchObject({
      ageBand: '5-7',
      mode: 'normal',
      reducedMotion: false,
    });
  });

  it('a dead tap records tapped_wrong_place with a semantic target, not coords', async () => {
    start();
    recordWorldTap(11.3, -4.7, null);
    const events = await readResearchEvents();
    const wrong = events.find((e) => e.event === 'tapped_wrong_place')!;
    expect(wrong.context.target).toBe('none');
    expect(JSON.stringify(wrong.context)).not.toContain('11.3');
  });

  it('the same target tapped twice inside the window records repeated_action', async () => {
    start();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    recordWorldTap(0, 0, 'anchor-square');
    vi.spyOn(Date, 'now').mockReturnValue(1800);
    recordWorldTap(0.1, 0.1, 'anchor-square');
    expect(await types()).toContain('repeated_action');
  });

  it('a deliberate re-tap after the window is a new action, not a repeat', async () => {
    start();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    recordWorldTap(0, 0, 'anchor-square');
    vi.spyOn(Date, 'now').mockReturnValue(4000);
    recordWorldTap(0, 0, 'anchor-square');
    expect(await types()).not.toContain('repeated_action');
  });

  it('different anchors in quick succession are not repeats', async () => {
    start();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    recordWorldTap(0, 0, 'anchor-square');
    vi.spyOn(Date, 'now').mockReturnValue(1100);
    recordWorldTap(5, 5, 'anchor-shop');
    expect(await types()).not.toContain('repeated_action');
  });
});
