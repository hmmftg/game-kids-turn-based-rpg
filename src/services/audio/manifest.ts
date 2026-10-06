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
 * All assets are synthesized by `scripts/generate-audio.ts` and bundled under
 * `public/audio/` — no third-party music, no remote URLs. They are soft
 * placeholder timbres; replace with licensed recordings before release.
 * The game stays fully playable if a fetch or decode fails.
 */
export const AUDIO_MANIFEST: readonly AudioAsset[] = [
  {
    id: 'music-hub',
    bus: 'music',
    url: './audio/music-hub.wav',
    loop: true,
    licence: 'generated-local-placeholder',
    note: 'موسیقی محله — ملودی آرام ساخته‌شده با ژنراتور داخلی.',
  },
  {
    id: 'sfx-choice',
    bus: 'sfx',
    url: './audio/sfx-choice.wav',
    loop: false,
    licence: 'generated-local-placeholder',
    note: 'صدای انتخاب — دو نت کوتاه.',
  },
  {
    id: 'sfx-success',
    bus: 'sfx',
    url: './audio/sfx-success.wav',
    loop: false,
    licence: 'generated-local-placeholder',
    note: 'صدای موفقیت — سه نت صعودی.',
  },
  {
    id: 'sfx-sticker',
    bus: 'sfx',
    url: './audio/sfx-sticker.wav',
    loop: false,
    licence: 'generated-local-placeholder',
    note: 'صدای برچسب — جلای کوتاه.',
  },
  {
    id: 'sfx-tap',
    bus: 'sfx',
    url: './audio/sfx-tap.wav',
    loop: false,
    licence: 'generated-local-placeholder',
    note: 'صدای لمس — تک‌نت خیلی کوتاه.',
  },
  {
    id: 'sfx-arrive',
    bus: 'sfx',
    url: './audio/sfx-arrive.wav',
    loop: false,
    licence: 'generated-local-placeholder',
    note: 'صدای رسیدن — دو نت ملایم.',
  },
  {
    id: 'sfx-retry',
    bus: 'sfx',
    url: './audio/sfx-retry.wav',
    loop: false,
    licence: 'generated-local-placeholder',
    note: 'صدای ملایم تلاش دوباره — دو نت نزولی.',
  },
  {
    id: 'sfx-unlock',
    bus: 'sfx',
    url: './audio/sfx-unlock.wav',
    loop: false,
    licence: 'generated-local-placeholder',
    note: 'صدای باز شدن کار جدید — چهار نت صعودی.',
  },
];

export type AudioId = (typeof AUDIO_MANIFEST)[number]['id'];

export function getAudioAsset(id: string): AudioAsset | null {
  return AUDIO_MANIFEST.find((asset) => asset.id === id) ?? null;
}

/**
 * Emotional sound vocabulary — the small closed set the game needs, in
 * semantic roles rather than file names. Keep it this small: audio
 * reinforces an already-legible world, it never explains one (the game must
 * stay fully understandable muted). New emotional moments pick an existing
 * role; a new role needs the same closed-vocabulary review as a new
 * animation primitive.
 *
 * role           meaning
 * tap_soft       the world felt the touch
 * success_small  the child did the thing — a small win, not a fanfare
 * friend_happy   someone is glad the child is here
 * discovery      something new appeared / a hidden thing surfaced
 * transition     going somewhere / arriving — place changed
 * retry_soft     wrong pick — gentle "try again", never punitive
 * ambient        neighbourhood bed under everything
 */
export type SoundRole =
  | 'tap_soft'
  | 'success_small'
  | 'friend_happy'
  | 'discovery'
  | 'transition'
  | 'retry_soft'
  | 'ambient';

export const SOUND_VOCABULARY: Readonly<Record<SoundRole, AudioId>> = {
  tap_soft: 'sfx-tap',
  success_small: 'sfx-success',
  friend_happy: 'sfx-sticker',
  discovery: 'sfx-unlock',
  transition: 'sfx-arrive',
  retry_soft: 'sfx-retry',
  ambient: 'music-hub',
};
