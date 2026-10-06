import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearResearchEvents,
  enqueueResearchEvent,
  flushResearchQueue,
  readResearchEvents,
  researchEndpointConfigured,
} from './queue.ts';

// Endpoint unset in the test env → the upload path must be inert (the
// parent-only PocketBase flush only exists when configured at build time).

describe('research upload queue (PR R+ PocketBase flush)', () => {
  beforeEach(async () => {
    await clearResearchEvents();
    vi.restoreAllMocks();
  });

  it('is skipped when no endpoint is configured', async () => {
    await enqueueResearchEvent({
      sessionId: 's',
      timestamp: 1,
      event: 'started_game',
      context: {},
    });
    expect(researchEndpointConfigured()).toBe(false);
    expect(await flushResearchQueue('s')).toBe('skipped');
    // Nothing leaves the device — the event stays queued for export.
    expect(await readResearchEvents()).toHaveLength(1);
  });

  it('is skipped while offline even if an endpoint existed', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await flushResearchQueue('s')).toBe('skipped');
  });

  it('is skipped on an empty queue', async () => {
    expect(await flushResearchQueue('s')).toBe('skipped');
  });
});
