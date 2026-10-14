import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

describe('AUDIO_MANIFEST provenance', () => {
  it('every asset with a url resolves to a shipped file under public/audio/', () => {
    for (const asset of AUDIO_MANIFEST) {
      if (asset.url === null) continue;
      const file = join(process.cwd(), 'public', asset.url.replace(/^\.\//, ''));
      expect(existsSync(file), `${asset.id} → ${asset.url}`).toBe(true);
    }
  });

  it('every shipped asset carries a resolved licence — no placeholders ship', () => {
    for (const asset of AUDIO_MANIFEST) {
      if (asset.url === null) continue;
      expect(asset.licence, asset.id).not.toContain('placeholder');
      expect(asset.note.trim(), asset.id).not.toBe('');
      expect(asset.source.trim(), asset.id).not.toBe('');
    }
  });

  it('CC-BY assets declare a non-empty attribution line', () => {
    const ccBy = AUDIO_MANIFEST.filter((asset) => asset.licence.startsWith('CC-BY'));
    expect(ccBy.length).toBeGreaterThan(0);
    for (const asset of ccBy) {
      expect(asset.attribution.trim(), asset.id).not.toBe('');
    }
  });
});
