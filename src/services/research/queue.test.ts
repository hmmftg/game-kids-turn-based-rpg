import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearResearchEvents,
  enqueueResearchEvent,
  flushResearchQueue,
  readResearchEvents,
  researchEndpointConfigured,
} from './queue.ts';
import { DEFAULT_RESEARCH_API_URL } from './defaultEndpoint.ts';

// The endpoint has a built-in default (DEFAULT_RESEARCH_API_URL) —
// VITE_RESEARCH_API_URL only overrides it — so the flush tests mock fetch.

describe('research upload queue (PR R+ PocketBase flush)', () => {
  beforeEach(async () => {
    await clearResearchEvents();
    vi.restoreAllMocks();
  });

  it('posts each queued event to the default endpoint and clears the queue', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    await enqueueResearchEvent({
      sessionId: 's',
      timestamp: 1,
      event: 'started_game',
      context: {},
    });
    expect(researchEndpointConfigured()).toBe(true);
    expect(await flushResearchQueue('s')).toBe('uploaded');
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe(`${DEFAULT_RESEARCH_API_URL}/api/collections/research_events/records`);
    expect(await readResearchEvents()).toHaveLength(0);
  });

  it('keeps the unsent tail queued on a failed record', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));
    await enqueueResearchEvent({
      sessionId: 's',
      timestamp: 1,
      event: 'started_game',
      context: {},
    });
    await expect(flushResearchQueue('s')).rejects.toThrow('research-upload-500');
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
