# Audio — provenance, pipeline, licensing

Offline-first audio: every asset is bundled under `public/audio/` and
precached by the service worker. No remote URLs, no runtime audio services.

Three separate concerns, kept distinct deliberately:

1. **Source-code provenance** — `scripts/generate-audio.ts` (SFX synthesis)
   and `scripts/encode-music.ts` (music encoding) live in this repo, MIT.
2. **Generated/encoded file provenance** — the table below records exactly
   which tool produced each shipped file and from what input.
3. **Licensing** — SFX are original deterministic output of our own generator
   and ship under the project's MIT licence (`generated-local-mit`). Music is
   third-party CC BY 4.0 and carries a mandatory attribution line.

## Asset inventory (measured from the shipped files)

| id                  | file                                 | purpose                                           | format                   | duration | size        | licence             | attribution                                         |
| ------------------- | ------------------------------------ | ------------------------------------------------- | ------------------------ | -------- | ----------- | ------------------- | --------------------------------------------------- |
| `music-menu`        | `public/audio/music-menu.mp3`        | menu modes (title / profile / avatar)             | MP3 128k stereo 44.1 kHz | 80.3 s   | 1,285,686 B | CC BY 4.0           | Music by Clement Panchout – www.clementpanchout.com |
| `music-hub`         | `public/audio/music-hub.mp3`         | world modes (hub / dialogue / encounter / paused) | MP3 128k stereo 44.1 kHz | 54.6 s   | 874,414 B   | CC BY 4.0           | Music by Clement Panchout – www.clementpanchout.com |
| `music-celebration` | `public/audio/music-celebration.mp3` | quest-complete overlay cue (one-shot)             | MP3 128k stereo 44.1 kHz | 84.8 s   | 1,356,739 B | CC BY 4.0           | Music by Clement Panchout – www.clementpanchout.com |
| `music-battle`      | `public/audio/music-battle.mp3`      | battle overlay                                    | MP3 128k stereo 44.1 kHz | 81.0 s   | 1,295,717 B | CC BY 4.0           | Music by Clement Panchout – www.clementpanchout.com |
| `sfx-tap`           | `public/audio/sfx-tap.wav`           | touch felt                                        | WAV s16 mono 22.05 kHz   | ~0.1 s   | 6,220 B     | generated-local-mit | —                                                   |
| `sfx-choice`        | `public/audio/sfx-choice.wav`        | choice / menu tap                                 | WAV s16 mono 22.05 kHz   | ~0.3 s   | 13,716 B    | generated-local-mit | —                                                   |
| `sfx-success`       | `public/audio/sfx-success.wav`       | small win                                         | WAV s16 mono 22.05 kHz   | ~0.6 s   | 23,858 B    | generated-local-mit | —                                                   |
| `sfx-sticker`       | `public/audio/sfx-sticker.wav`       | sticker / friend happy                            | WAV s16 mono 22.05 kHz   | ~0.5 s   | 19,008 B    | generated-local-mit | —                                                   |
| `sfx-arrive`        | `public/audio/sfx-arrive.wav`        | arrival transition                                | WAV s16 mono 22.05 kHz   | ~0.5 s   | 19,008 B    | generated-local-mit | —                                                   |
| `sfx-retry`         | `public/audio/sfx-retry.wav`         | gentle retry (never punitive)                     | WAV s16 mono 22.05 kHz   | ~0.6 s   | 22,536 B    | generated-local-mit | —                                                   |
| `sfx-unlock`        | `public/audio/sfx-unlock.wav`        | new work appeared                                 | WAV s16 mono 22.05 kHz   | ~0.8 s   | 27,388 B    | generated-local-mit | —                                                   |

Total audio payload: **≈ 4.7 MB** (music 4.59 MB + SFX 0.13 MB) against the
10 MB gzip total-transfer budget enforced by `scripts/check-budgets.ts`.
Each MP3 is well under the 6 MB `maximumFileSizeToCacheInBytes` precache cap.

## Music provenance

All four tracks are by **Clement Panchout**, from his free music packs on
itch.io (`clement-panchout.itch.io`), licensed **CC BY 4.0** — free for
commercial use, attribution required, resale and AI training prohibited.

- `music-menu` ← "Cheerful Title Screen" (Partycles OST, 2014)
- `music-hub` ← "Journey" (2017)
- `music-celebration` ← "Best Party Ever" (Music Weeklies 2019)
- `music-battle` ← "Unrecord" (2023)

**Attribution surfaces:** the parent-area credits section
(`src/ui/parent/ParentArea.tsx`) renders every distinct non-empty
`attribution` line from `AUDIO_MANIFEST`; the canonical line is
`Music by Clement Panchout – www.clementpanchout.com`. Adding another
attribution-required asset automatically adds its credit.

**Source stash:** the original WAVs live in `downloaded-musics/` — a
maintainer-local, gitignored directory (like `downloaded-models/`). Re-fetch
them from the itch.io pack if absent. Do not commit them; the encoded MP3s
are the shipped artifact.

## How playback works

- `src/services/audio/audioService.ts` — lazy `AudioContext`, separate
  music/sfx `GainNode` buses, buffer cache, `dispose()` is non-terminal (a
  later `unlock()` builds a fresh context).
- **Gesture unlock:** `unlock()` only succeeds inside a real user gesture
  (browser autoplay policy). The first menu tap routes through
  `playSfx`/`playMusic` (`unlock().then(play)`); an effect alone can never
  start audio, so the menu theme simply isn't audible before the first tap.
- **Routing:** `src/app/musicRouting.ts` — pure `musicForState(mode,
battleActive)`. Battle is a state overlay (not a mode) and wins when live.
  The celebration cue is event-driven in `App.tsx` and resumes the routed
  bed on dismiss via the same helper.
- **Suspend on hidden:** `visibilitychange` → `setSuspended` + `PAUSE`.
- **Settings:** `SET_AUDIO_SETTINGS` (existing, clamped 0..1, persisted) →
  `applySettings` pushes music/sfx gain. Pause menu has mute toggles +
  `music-volume`/`sfx-volume` sliders.

## Adding or replacing a track

1. Drop the source WAV into `downloaded-musics/` and confirm its licence
   permits game redistribution (CC BY 4.0 needs the `attribution` field).
2. Add a `TrackSpec` row in `scripts/encode-music.ts`.
3. Run `node --experimental-strip-types scripts/encode-music.ts`
   (ffmpeg required — `FFMPEG` env var, PATH, or the documented local
   fallback; **not** a repo dependency).
4. Commit the resulting `public/audio/*.mp3` plus the manifest entry.
5. `npm run build` — `validate:assets` fails if the file isn't declared;
   `check:budgets` fails if the payload breaks the transfer budget.

## Seamless loops

MP3 carries encoder priming (`start: 0.025` in the files above — browsers
that read the LAME/Xing header trim it). The loop seam is additionally baked
away: `encode-music.ts` folds the last 2 s over the head in PCM (`foldLoopTail`,
the same contract as `generate-audio.ts`'s `loopTail`), so the wrap point is
continuous audio even where priming survives. Non-looping cues
(`music-celebration`) skip the fold.

## SFX regeneration

`node --experimental-strip-types scripts/generate-audio.ts` regenerates every
`sfx-*.wav` deterministically (mono 22050 Hz s16). Re-run and commit whenever
a jingle changes; keep them gentle — no harsh or punitive sounds.

## Release licensing review

Before a public content release: `npm run validate:assets:release` must be
clean (it fails on placeholder licences and on CC-BY entries missing an
attribution line). Re-verify each external track's licence at that time —
the itch.io page states CC BY 4.0 today; if a future pack/track changes
terms, swap the asset before shipping.
