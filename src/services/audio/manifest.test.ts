import { describe, expect, it } from 'vitest';
import { AUDIO_MANIFEST, SOUND_VOCABULARY } from './manifest.ts';

describe('SOUND_VOCABULARY (PR Q — emotional audio layer)', () => {
  it('every emotional role resolves to a real, sounding manifest slot', () => {
    for (const [role, id] of Object.entries(SOUND_VOCABULARY)) {
      const asset = AUDIO_MANIFEST.find((a) => a.id === id);
      expect(asset, `role ${role}`).toBeDefined();
      // A role must never resolve to a silent slot — the vocabulary exists to
      // describe sounds that actually play.
      expect(asset!.url, `role ${role}`).not.toBeNull();
    }
  });

  it('stays small — the vocabulary is a closed set, not a directory', () => {
    expect(Object.keys(SOUND_VOCABULARY).length).toBeLessThanOrEqual(10);
  });
});
