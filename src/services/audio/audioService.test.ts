import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioService } from './audioService.ts';

/**
 * Web Audio contract tests. jsdom has no AudioContext, so a minimal fake
 * stands in: enough surface for connect/start/stop/suspend assertions
 * without asserting browser internals.
 */

class FakeGainNode {
  readonly gain = { value: 1 };
  readonly connectedTo: unknown[] = [];
  connect(node: unknown) {
    this.connectedTo.push(node);
  }
}

class FakeSourceNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  started = false;
  stopped = false;
  connectedTo: unknown[] = [];
  connect(node: unknown) {
    this.connectedTo.push(node);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}

class FakeAudioContext {
  state: AudioContextState = 'running';
  readonly destination = {};
  readonly gains: FakeGainNode[] = [];
  readonly sources: FakeSourceNode[] = [];
  closed = false;
  failDecode = false;
  failResume = false;

  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }
  createBufferSource() {
    const source = new FakeSourceNode();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
  async decodeAudioData(): Promise<AudioBuffer> {
    if (this.failDecode) throw new Error('decode failed');
    return { duration: 1 } as AudioBuffer;
  }
  async resume() {
    if (this.failResume) throw new Error('autoplay blocked');
    this.state = 'running';
  }
  async suspend() {
    this.state = 'suspended';
  }
  async close() {
    this.closed = true;
    this.state = 'closed';
  }
}

let lastContext: FakeAudioContext | null = null;
let fetchSpy: ReturnType<typeof vi.fn>;

/** `new AudioContext()` must return a tracked fake — a factory returning the
 *  instance object satisfies `new` while keeping no `this` aliasing. */
function stubAudioContext(opts: { suspended?: boolean; failResume?: boolean } = {}) {
  vi.stubGlobal('AudioContext', function () {
    const ctx = new FakeAudioContext();
    if (opts.suspended) ctx.state = 'suspended';
    if (opts.failResume) ctx.failResume = true;
    lastContext = ctx;
    return ctx;
  });
}

beforeEach(() => {
  lastContext = null;
  fetchSpy = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal('fetch', fetchSpy);
  stubAudioContext();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AudioService', () => {
  it('play before unlock is a no-op — no fetch, no source', async () => {
    const service = new AudioService();
    await service.play('music-hub');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lastContext).toBeNull();
  });

  it('starts a looping music track after unlock', async () => {
    const service = new AudioService();
    await service.unlock();
    await service.play('music-hub');
    expect(lastContext?.sources).toHaveLength(1);
    expect(lastContext?.sources[0]?.started).toBe(true);
    expect(lastContext?.sources[0]?.loop).toBe(true);
    expect(service.unlocked).toBe(true);
  });

  it('switching music ids stops the previous source — no overlap', async () => {
    const service = new AudioService();
    await service.unlock();
    await service.play('music-menu');
    await service.play('music-hub');
    const sources = lastContext?.sources ?? [];
    expect(sources).toHaveLength(2);
    expect(sources[0]?.stopped).toBe(true);
    expect(sources[1]?.stopped).toBe(false);
  });

  it('re-playing the same music id does not double-start', async () => {
    const service = new AudioService();
    await service.unlock();
    await service.play('music-hub');
    await service.play('music-hub');
    expect(lastContext?.sources).toHaveLength(1);
  });

  it('routes music and sfx volume to their own gain buses', async () => {
    const service = new AudioService();
    await service.unlock();
    service.applySettings({
      musicMuted: false,
      sfxMuted: false,
      musicVolume: 0.3,
      sfxVolume: 0.7,
    });
    expect(lastContext?.gains[0]?.gain.value).toBe(0.3); // music gain
    expect(lastContext?.gains[1]?.gain.value).toBe(0.7); // sfx gain
  });

  it('mute zeroes the bus gain without touching the other bus', async () => {
    const service = new AudioService();
    await service.unlock();
    service.applySettings({
      musicMuted: true,
      sfxMuted: false,
      musicVolume: 0.5,
      sfxVolume: 0.8,
    });
    expect(lastContext?.gains[0]?.gain.value).toBe(0);
    expect(lastContext?.gains[1]?.gain.value).toBe(0.8);
  });

  it('unknown ids and failed decode/fetch stay graceful — silent, no throw', async () => {
    const service = new AudioService();
    await service.unlock();
    await service.play('does-not-exist');
    expect(lastContext?.sources).toHaveLength(0);
    fetchSpy.mockRejectedValueOnce(new Error('offline'));
    await service.play('music-hub'); // fetch rejects → silent no-op
    expect(lastContext?.sources).toHaveLength(0);
  });

  it('a suspended context resume failure never surfaces as unhandled', async () => {
    stubAudioContext({ suspended: true, failResume: true });
    const service = new AudioService();
    await expect(service.unlock()).resolves.toBeUndefined();
    expect(service.unlocked).toBe(false);
  });

  it('setSuspended suspends and resumes the live context only', async () => {
    const service = new AudioService();
    await service.setSuspended(true); // no context — no-op
    await service.unlock();
    await service.setSuspended(true);
    expect(lastContext?.state).toBe('suspended');
    await service.setSuspended(false);
    expect(lastContext?.state).toBe('running');
  });

  it('dispose closes the context and a later unlock builds a fresh one', async () => {
    const service = new AudioService();
    await service.unlock();
    const first = lastContext;
    service.dispose();
    expect(first?.closed).toBe(true);
    expect(service.unlocked).toBe(false);

    await service.unlock();
    expect(lastContext).not.toBe(first);
    expect(service.unlocked).toBe(true);
    await service.play('music-hub');
    expect(lastContext?.sources[0]?.started).toBe(true);
  });
});
