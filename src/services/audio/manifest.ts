export type AudioBus = 'music' | 'sfx';

/**
 * Provenance licence for a shipped audio asset:
 * - `placeholder-silence`: intentionally silent slot (url null)
 * - `generated-local-mit`: original output of `scripts/generate-audio.ts`,
 *   released under the project's MIT licence — no third-party input
 * - `CC-BY-4.0`: Creative Commons Attribution 4.0 — `attribution` required
 * - `licensed`: other reviewed licence — `source`/`attribution` record terms
 */
export type AudioLicence = 'placeholder-silence' | 'generated-local-mit' | 'CC-BY-4.0' | 'licensed';

export interface AudioAsset {
  readonly id: string;
  readonly bus: AudioBus;
  /** Local asset URL, or null while the slot is intentionally silent. */
  readonly url: string | null;
  readonly loop: boolean;
  /** Provenance: nothing may ship without a verified, permissioned licence. */
  readonly licence: AudioLicence;
  /** Credit line shown when the licence requires attribution (else empty). */
  readonly attribution: string;
  /** Where the asset came from — author, pack, or generator. */
  readonly source: string;
  readonly note: string;
}

const PANCHOUT = {
  attribution: 'Music by Clement Panchout – www.clementpanchout.com',
  source: 'Clement Panchout free music pack — clement-panchout.itch.io',
} as const;

const GENERATED = {
  attribution: '',
  source: 'scripts/generate-audio.ts (original synthesis, MIT)',
} as const;

/**
 * Audio manifest.
 *
 * Music beds are licensed CC BY 4.0 recordings (encoded by
 * `scripts/encode-music.ts` → `public/audio/*.mp3`, bundled and precached —
 * no remote URLs). SFX are synthesized by `scripts/generate-audio.ts` and
 * released under the project MIT licence. The game stays fully playable if a
 * fetch or decode fails. Provenance details: docs/AUDIO.md.
 */
export const AUDIO_MANIFEST: readonly AudioAsset[] = [
  {
    id: 'music-menu',
    bus: 'music',
    url: './audio/music-menu.mp3',
    loop: true,
    licence: 'CC-BY-4.0',
    ...PANCHOUT,
    note: 'موسیقی منو — ملودی شاد و مهربان (Cheerful Title Screen, 2014).',
  },
  {
    id: 'music-hub',
    bus: 'music',
    url: './audio/music-hub.mp3',
    loop: true,
    licence: 'CC-BY-4.0',
    ...PANCHOUT,
    note: 'موسیقی محله — تم آرام و سینمایی (Journey, 2017).',
  },
  {
    id: 'music-celebration',
    bus: 'music',
    url: './audio/music-celebration.mp3',
    loop: false,
    licence: 'CC-BY-4.0',
    ...PANCHOUT,
    note: 'موسیقی جشن تکمیل کار — یک‌بار پخش (Best Party Ever, 2019).',
  },
  {
    id: 'music-battle',
    bus: 'music',
    url: './audio/music-battle.mp3',
    loop: true,
    licence: 'CC-BY-4.0',
    ...PANCHOUT,
    note: 'موسیقی نبرد — تم ملایم و پرانرژی (Unrecord, 2023).',
  },
  {
    id: 'sfx-choice',
    bus: 'sfx',
    url: './audio/sfx-choice.wav',
    loop: false,
    licence: 'generated-local-mit',
    ...GENERATED,
    note: 'صدای انتخاب — دو نت کوتاه.',
  },
  {
    id: 'sfx-success',
    bus: 'sfx',
    url: './audio/sfx-success.wav',
    loop: false,
    licence: 'generated-local-mit',
    ...GENERATED,
    note: 'صدای موفقیت — سه نت صعودی.',
  },
  {
    id: 'sfx-sticker',
    bus: 'sfx',
    url: './audio/sfx-sticker.wav',
    loop: false,
    licence: 'generated-local-mit',
    ...GENERATED,
    note: 'صدای برچسب — جلای کوتاه.',
  },
  {
    id: 'sfx-tap',
    bus: 'sfx',
    url: './audio/sfx-tap.wav',
    loop: false,
    licence: 'generated-local-mit',
    ...GENERATED,
    note: 'صدای لمس — تک‌نت خیلی کوتاه.',
  },
  {
    id: 'sfx-arrive',
    bus: 'sfx',
    url: './audio/sfx-arrive.wav',
    loop: false,
    licence: 'generated-local-mit',
    ...GENERATED,
    note: 'صدای رسیدن — دو نت ملایم.',
  },
  {
    id: 'sfx-retry',
    bus: 'sfx',
    url: './audio/sfx-retry.wav',
    loop: false,
    licence: 'generated-local-mit',
    ...GENERATED,
    note: 'صدای ملایم تلاش دوباره — دو نت نزولی.',
  },
  {
    id: 'sfx-unlock',
    bus: 'sfx',
    url: './audio/sfx-unlock.wav',
    loop: false,
    licence: 'generated-local-mit',
    ...GENERATED,
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
