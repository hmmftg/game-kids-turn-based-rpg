import { describe, expect, it } from 'vitest';
import { MODES } from '../domain/game/types.ts';
import { AUDIO_MANIFEST } from '../services/audio/manifest.ts';
import { musicForState } from './musicRouting.ts';

describe('musicForState', () => {
  it('menus get the menu theme', () => {
    for (const mode of ['title', 'profileSelect', 'avatarSelect'] as const) {
      expect(musicForState(mode, false)).toBe('music-menu');
    }
  });

  it('world modes get the hub theme', () => {
    for (const mode of ['hub', 'dialogue', 'encounter', 'paused'] as const) {
      expect(musicForState(mode, false)).toBe('music-hub');
    }
  });

  it('an active battle overrides the mode bed', () => {
    expect(musicForState('hub', true)).toBe('music-battle');
    expect(musicForState('encounter', true)).toBe('music-battle');
  });

  it('silent modes return null — caller stops playback', () => {
    for (const mode of ['boot', 'parentGate', 'parentArea', 'fatalFallback'] as const) {
      expect(musicForState(mode, false)).toBeNull();
    }
  });

  it('every routed id exists in the manifest', () => {
    const ids = new Set(AUDIO_MANIFEST.map((a) => a.id));
    for (const mode of MODES) {
      const id = musicForState(mode, false);
      if (id !== null) expect(ids.has(id), `${mode} → ${id}`).toBe(true);
    }
  });
});
