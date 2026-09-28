/**
 * Generates the bundled audio assets (public/audio/*.wav).
 *
 * Everything is synthesized here — pure sine/triangle tones with soft
 * envelopes — so the game ships audio with zero third-party licensing.
 * Run: `node --experimental-strip-types scripts/generate-audio.ts`
 * Re-run and commit whenever a melody or jingle changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SAMPLE_RATE = 22050;
const OUT_DIR = 'public/audio';

type Note = { freq: number; start: number; dur: number; gain?: number; wave?: 'sine' | 'triangle' };

function render(notes: readonly Note[], seconds: number, loopTail: number): Float32Array {
  const length = Math.ceil(seconds * SAMPLE_RATE);
  const out = new Float32Array(length);
  for (const note of notes) {
    const start = Math.floor(note.start * SAMPLE_RATE);
    const dur = Math.floor(note.dur * SAMPLE_RATE);
    const gain = note.gain ?? 0.5;
    for (let i = 0; i < dur && start + i < length; i++) {
      const t = i / SAMPLE_RATE;
      // Gentle attack/release to avoid clicks; keeps it soft for kids.
      const a = Math.min(1, t / 0.015);
      const r = Math.min(1, (dur - i) / SAMPLE_RATE / 0.06);
      const env = Math.min(a, r) * gain;
      const phase = 2 * Math.PI * note.freq * t;
      const s =
        (note.wave ?? 'sine') === 'triangle'
          ? (2 / Math.PI) * Math.asin(Math.sin(phase))
          : Math.sin(phase);
      out[start + i] = (out[start + i] ?? 0) + s * env;
    }
  }
  // Crossfade the tail into the head so looped music has no seam click.
  if (loopTail > 0) {
    const tail = Math.floor(loopTail * SAMPLE_RATE);
    for (let i = 0; i < tail && i < length; i++) {
      const m = i / tail;
      out[i] = (out[i] ?? 0) * m + (out[length - tail + i] ?? 0) * (1 - m);
    }
    return out.subarray(0, length - tail);
  }
  return out;
}

function writeWav(name: string, samples: Float32Array): void {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(join(OUT_DIR, `${name}.wav`), Buffer.concat([header, data]));
  console.log(`audio/${name}.wav`, `${((36 + data.length) / 1024).toFixed(1)} KB`);
}

// C-major pentatonic-ish helpers (Hz)
const C4 = 261.63,
  D4 = 293.66,
  E4 = 329.63,
  G4 = 392.0,
  A4 = 440.0,
  C5 = 523.25,
  E5 = 659.25,
  G5 = 783.99;

function hubMusic(): Float32Array {
  // 8-bar gentle loop, ~16s at a slow swaying feel.
  const melody = [C5, A4, G4, E4, D4, E4, G4, A4, C5, A4, G4, E4, D4, C4, D4, E4];
  const bass = [C4, G4 * 0.5, A4 * 0.5, C4, C4, G4 * 0.5, A4 * 0.5, C4];
  const notes: Note[] = [];
  const beat = 0.5;
  melody.forEach((freq, i) => {
    notes.push({ freq, start: i * beat, dur: 0.42, gain: 0.3, wave: 'triangle' });
    notes.push({ freq: freq * 2, start: i * beat, dur: 0.42, gain: 0.06 });
  });
  bass.forEach((freq, i) => {
    notes.push({ freq, start: i * beat * 2, dur: 0.9, gain: 0.16 });
  });
  return render(notes, melody.length * beat + 0.9, 0.25);
}

function jingle(freqs: readonly number[], step: number, dur: number, gain = 0.4): Float32Array {
  const notes = freqs.map((freq, i) => ({
    freq,
    start: i * step,
    dur,
    gain,
    wave: 'triangle' as const,
  }));
  return render(notes, freqs.length * step + dur + 0.05, 0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeWav('music-hub', hubMusic());
writeWav('sfx-tap', jingle([E5], 0, 0.09, 0.3));
writeWav('sfx-choice', jingle([C5, E5], 0.07, 0.12));
writeWav('sfx-success', jingle([C5, E5, G5], 0.09, 0.22));
writeWav('sfx-sticker', jingle([G5, E5, C5 * 2], 0.06, 0.2, 0.32));
writeWav('sfx-arrive', jingle([E4, G4], 0.09, 0.2, 0.3));
writeWav('sfx-retry', jingle([G4, E4], 0.12, 0.22, 0.28));
writeWav('sfx-unlock', jingle([C4, E4, G4, C5], 0.08, 0.25));
