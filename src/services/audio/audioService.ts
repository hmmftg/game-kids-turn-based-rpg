import type { AudioSettings } from '../../domain/game/types.ts';
import { AUDIO_MANIFEST, type AudioAsset, type AudioBus } from './manifest.ts';

/**
 * Audio service.
 *
 * - The AudioContext is created lazily and only resumed from a real user
 *   gesture, so autoplay policies never block the first screen.
 * - Music and SFX have separate gain buses; mute and volume are owned by the
 *   domain state and pushed in via `applySettings`.
 * - Playback pauses when the document is hidden.
 * - Assets with `url: null` are silent placeholders: the game must stay fully
 *   playable with no audio at all.
 */
export class AudioService {
  #context: AudioContext | null = null;
  #musicGain: GainNode | null = null;
  #sfxGain: GainNode | null = null;
  #buffers = new Map<string, AudioBuffer>();
  #music: AudioBufferSourceNode | null = null;
  #settings: AudioSettings = {
    musicMuted: false,
    sfxMuted: false,
    musicVolume: 0.5,
    sfxVolume: 0.8,
  };
  #unlocked = false;

  get unlocked(): boolean {
    return this.#unlocked;
  }

  /** Must be called from a user gesture handler. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (this.#unlocked) return;
    const Ctor =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return;
    try {
      const context = new Ctor();
      const musicGain = context.createGain();
      const sfxGain = context.createGain();
      musicGain.connect(context.destination);
      sfxGain.connect(context.destination);
      this.#context = context;
      this.#musicGain = musicGain;
      this.#sfxGain = sfxGain;
      this.#unlocked = true;
      this.applySettings(this.#settings);
      if (context.state === 'suspended') await context.resume();
    } catch {
      this.#unlocked = false;
    }
  }

  applySettings(settings: AudioSettings): void {
    this.#settings = settings;
    if (this.#musicGain)
      this.#musicGain.gain.value = settings.musicMuted ? 0 : settings.musicVolume;
    if (this.#sfxGain) this.#sfxGain.gain.value = settings.sfxMuted ? 0 : settings.sfxVolume;
  }

  async play(id: string): Promise<void> {
    const asset = AUDIO_MANIFEST.find((entry) => entry.id === id);
    if (!asset || asset.url === null) return; // silent placeholder
    if (!this.#unlocked || !this.#context) return;
    const buffer = await this.#load(asset);
    if (!buffer) return;
    const source = this.#context.createBufferSource();
    source.buffer = buffer;
    source.loop = asset.loop;
    source.connect(this.#busFor(asset.bus));
    source.start();
    if (asset.bus === 'music') {
      this.#music?.stop();
      this.#music = source;
    }
  }

  stopMusic(): void {
    this.#music?.stop();
    this.#music = null;
  }

  async setSuspended(suspended: boolean): Promise<void> {
    const context = this.#context;
    if (!context) return;
    try {
      if (suspended && context.state === 'running') await context.suspend();
      if (!suspended && context.state === 'suspended') await context.resume();
    } catch {
      /* transient state change; audio stays optional */
    }
  }

  dispose(): void {
    this.stopMusic();
    void this.#context?.close();
    this.#context = null;
    this.#musicGain = null;
    this.#sfxGain = null;
    this.#buffers.clear();
    this.#unlocked = false;
  }

  #busFor(bus: AudioBus): GainNode {
    const node = bus === 'music' ? this.#musicGain : this.#sfxGain;
    if (!node) throw new Error('Audio bus unavailable');
    return node;
  }

  async #load(asset: AudioAsset): Promise<AudioBuffer | null> {
    if (asset.url === null || !this.#context) return null;
    const cached = this.#buffers.get(asset.id);
    if (cached) return cached;
    try {
      // Same-origin only: every audio asset is bundled with the app and precached locally.
      // eslint-disable-next-line no-restricted-globals -- bundled local asset, never a remote URL
      const response = await fetch(new URL(asset.url, window.location.href).toString());
      const bytes = await response.arrayBuffer();
      const buffer = await this.#context.decodeAudioData(bytes);
      this.#buffers.set(asset.id, buffer);
      return buffer;
    } catch {
      return null;
    }
  }
}

export const audioService = new AudioService();
