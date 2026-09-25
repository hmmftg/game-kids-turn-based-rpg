export type AudioBus = 'music' | 'sfx';

export interface AudioAsset {
  readonly id: string;
  readonly bus: AudioBus;
  /** Local asset URL, or null while the slot is intentionally silent. */
  readonly url: string | null;
  readonly loop: boolean;
  /** Provenance: nothing may ship without a verified, permissioned licence. */
  readonly licence: 'placeholder-silence' | 'generated-local-placeholder' | 'licensed';
  readonly note: string;
}

/**
 * Audio manifest.
 *
 * TEMPORARY: every slot is silent. No third-party or unverified music is
 * downloaded or bundled; final audio must arrive with written licence terms and
 * attribution before release. The game is fully playable with no audio at all.
 */
export const AUDIO_MANIFEST: readonly AudioAsset[] = [
  {
    id: 'music-hub',
    bus: 'music',
    url: null,
    loop: true,
    licence: 'placeholder-silence',
    note: 'موسیقی محله — جای‌نگه‌دار خاموش تا رسیدن نسخه‌ی دارای مجوز.',
  },
  {
    id: 'sfx-choice',
    bus: 'sfx',
    url: null,
    loop: false,
    licence: 'placeholder-silence',
    note: 'صدای انتخاب — جای‌نگه‌دار خاموش.',
  },
  {
    id: 'sfx-success',
    bus: 'sfx',
    url: null,
    loop: false,
    licence: 'placeholder-silence',
    note: 'صدای موفقیت — جای‌نگه‌دار خاموش.',
  },
  {
    id: 'sfx-sticker',
    bus: 'sfx',
    url: null,
    loop: false,
    licence: 'placeholder-silence',
    note: 'صدای برچسب — جای‌نگه‌دار خاموش.',
  },
];

export type AudioId = (typeof AUDIO_MANIFEST)[number]['id'];

export function getAudioAsset(id: string): AudioAsset | null {
  return AUDIO_MANIFEST.find((asset) => asset.id === id) ?? null;
}
