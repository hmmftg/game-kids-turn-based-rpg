/**
 * Encodes licensed music tracks into bundled MP3s (public/audio/*.mp3).
 *
 * Source WAVs live in `downloaded-musics/` — a maintainer-local, gitignored
 * stash (provenance in docs/AUDIO.md). They are third-party recordings (CC BY
 * 4.0), unlike the SFX which `generate-audio.ts` synthesizes from scratch.
 *
 * ffmpeg is required and NOT a repo dependency — it's maintainer tooling.
 * Resolution order: `FFMPEG` env var → `ffmpeg` on PATH → the documented
 * local fallback below. Run:
 *
 *   node --experimental-strip-types scripts/encode-music.ts
 *
 * Pipeline per track: ffmpeg loudnorm → temp WAV → in-script head/tail
 * crossfade (same fold math as `generate-audio.ts`'s loopTail, so looping has
 * no seam click) → temp WAV → ffmpeg libmp3lame encode. The crossfade runs in
 * PCM here because this ffmpeg build segfaults on `acrossfade` filter chains.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC_DIR = 'downloaded-musics';
const OUT_DIR = 'public/audio';
const BITRATE = '128k';
const SAMPLE_RATE = 44100;
const CHANNELS = 2;
/** Seconds of tail folded over the head for seamless looping. */
const LOOP_CROSSFADE_SEC = 2;
/**
 * Loudness target — calm, consistent beds under gameplay for ages 3-7.
 * `aformat` (not aresample) pins the layout after loudnorm: this ffmpeg build
 * emits loudnorm output without a channel layout, which aresample rejects.
 */
const LOUDNESS = 'loudnorm=I=-18:TP=-1.5:LRA=11,aformat=sample_rates=44100:channel_layouts=stereo';

/** Maintainer-local fallback — a VS Code extension bundle on this machine. */
const FALLBACK_FFMPEG =
  'C:\\Users\\h.malekmohammadi.SIMOTECHLAN\\.vscode\\extensions\\kilocode.kilo-code-7.4.22-win32-x64\\bin\\ffmpeg.exe';

interface TrackSpec {
  /** File name inside `downloaded-musics/`. */
  readonly source: string;
  /** Asset id / output file name (public/audio/<out>.mp3). */
  readonly out: string;
  /** Looping beds get the crossfade bake; one-shot cues do not. */
  readonly loop: boolean;
}

const TRACKS: readonly TrackSpec[] = [
  {
    source: '2014 07_ Clement Panchout_ Partycles OST_ Cheerful Title Screen.wav',
    out: 'music-menu',
    loop: true,
  },
  {
    source: 'Clement Panchout _ Journey _ 2017.wav',
    out: 'music-hub',
    loop: true,
  },
  {
    source: 'Clement Panchout_ Best Party Ever _ 2019.wav',
    out: 'music-celebration',
    loop: false,
  },
  {
    source: '2023 _ Clement Panchout - Unrecord.wav',
    out: 'music-battle',
    loop: true,
  },
];

function ffmpegWorks(bin: string): boolean {
  try {
    execFileSync(bin, ['-version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function resolveFfmpeg(): string {
  if (process.env.FFMPEG && ffmpegWorks(process.env.FFMPEG)) return process.env.FFMPEG;
  if (ffmpegWorks('ffmpeg')) return 'ffmpeg';
  if (ffmpegWorks(FALLBACK_FFMPEG)) return FALLBACK_FFMPEG;
  console.error('ffmpeg not found — install it or set the FFMPEG env var (see docs/AUDIO.md).');
  process.exit(1);
}

interface PcmWav {
  readonly sampleRate: number;
  readonly channels: number;
  /** Interleaved samples, -1..1. */
  readonly samples: Float32Array;
}

/** Minimal RIFF walk → decoded s16le PCM (the only format we feed it). */
function readWav(path: string): PcmWav {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} is not a RIFF/WAVE file`);
  }
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let data: Buffer | null = null;
  for (let off = 12; off + 8 <= buf.length;) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(off + 10);
      sampleRate = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
    }
    if (id === 'data') {
      data = buf.subarray(off + 8, off + 8 + size);
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!data || bits !== 16) throw new Error(`${path}: expected 16-bit PCM data chunk`);
  const samples = new Float32Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
  return { sampleRate, channels, samples };
}

function writeWav(path: string, wav: PcmWav): void {
  const data = Buffer.alloc(wav.samples.length * 2);
  for (let i = 0; i < wav.samples.length; i++) {
    const v = Math.max(-1, Math.min(1, wav.samples[i]!));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(wav.channels, 22);
  header.writeUInt32LE(wav.sampleRate, 24);
  header.writeUInt32LE(wav.sampleRate * wav.channels * 2, 28);
  header.writeUInt16LE(wav.channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

/**
 * Folds the last `seconds` over the head and truncates — identical contract
 * to `generate-audio.ts`'s loopTail so a looped buffer wraps seamlessly.
 */
function foldLoopTail(wav: PcmWav, seconds: number): PcmWav {
  const tail = Math.floor(seconds * wav.sampleRate) * wav.channels;
  const length = wav.samples.length;
  if (tail <= 0 || tail >= length) return wav;
  const out = wav.samples.slice();
  for (let i = 0; i < tail; i++) {
    const m = i / tail;
    out[i] = out[i]! * m + out[length - tail + i]! * (1 - m);
  }
  return { ...wav, samples: out.subarray(0, length - tail) };
}

function encode(ffmpeg: string, spec: TrackSpec): void {
  const src = join(SRC_DIR, spec.source);
  const dst = join(OUT_DIR, `${spec.out}.mp3`);
  if (!existsSync(src)) {
    throw new Error(`missing source ${src} — see docs/AUDIO.md for the maintainer stash`);
  }
  const tmpNorm = join(tmpdir(), `encode-music-${spec.out}-norm.wav`);
  const tmpLoop = join(tmpdir(), `encode-music-${spec.out}-loop.wav`);
  try {
    // Pass 1: loudness normalization to a temp WAV (s16 stereo 44.1k).
    execFileSync(ffmpeg, ['-y', '-i', src, '-af', LOUDNESS, '-f', 'wav', tmpNorm], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const wav = readWav(tmpNorm);
    if (wav.channels !== CHANNELS || wav.sampleRate !== SAMPLE_RATE) {
      throw new Error(`${src}: expected ${CHANNELS}ch ${SAMPLE_RATE}Hz after normalization`);
    }
    // Pass 1.5: loop crossfade in PCM (acrossfade segfaults on this build).
    const looped = spec.loop ? foldLoopTail(wav, LOOP_CROSSFADE_SEC) : wav;
    writeWav(tmpLoop, looped);
    // Pass 2: plain MP3 encode — no filters.
    execFileSync(ffmpeg, ['-y', '-i', tmpLoop, '-codec:a', 'libmp3lame', '-b:a', BITRATE, dst], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } finally {
    rmSync(tmpNorm, { force: true });
    rmSync(tmpLoop, { force: true });
  }
  const kb = (statSync(dst).size / 1024).toFixed(0);
  const dur = loopedSeconds(spec);
  console.log(
    `audio/${spec.out}.mp3  ${kb} KB  ~${dur.toFixed(1)}s  ${BITRATE} stereo` +
      (spec.loop ? `  (loop crossfade ${LOOP_CROSSFADE_SEC}s)` : ''),
  );
}

function loopedSeconds(spec: TrackSpec): number {
  const src = join(SRC_DIR, spec.source);
  const dur = readWav(src).samples.length / (SAMPLE_RATE * CHANNELS);
  return spec.loop ? dur - LOOP_CROSSFADE_SEC : dur;
}

const ffmpeg = resolveFfmpeg();
mkdirSync(OUT_DIR, { recursive: true });
for (const spec of TRACKS) encode(ffmpeg, spec);
