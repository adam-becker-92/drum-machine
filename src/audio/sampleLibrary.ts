import { getSample } from '../io/sampleStore';
import { midiToFreq } from './dsp';

export interface BuiltInSample {
  id: string;
  name: string;
  root: number; // MIDI note the recording plays at natural speed
  render: (ctx: BaseAudioContext) => AudioBuffer;
}

const BUILTIN_PREFIX = 'builtin:';

export function isBuiltInSample(id: string): boolean {
  return id.startsWith(BUILTIN_PREFIX);
}

function normalize(data: Float32Array, peak = 0.8) {
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < data.length; i++) data[i] *= peak / max;
}

function fadeOut(data: Float32Array, samples: number) {
  for (let i = 0; i < samples; i++) data[data.length - 1 - i] *= i / samples;
}

// Karplus–Strong plucked string: a noise burst circulating in a damped delay line.
function renderPluck(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(sr * 2.5), sr);
  const out = buffer.getChannelData(0);
  const period = Math.round(sr / midiToFreq(48));
  const ring = new Float32Array(period).map(() => Math.random() * 2 - 1);
  for (let i = 0, idx = 0; i < out.length; i++) {
    const next = (idx + 1) % period;
    out[i] = ring[idx];
    ring[idx] = 0.5 * (ring[idx] + ring[next]) * 0.997;
    idx = next;
  }
  normalize(out);
  fadeOut(out, Math.floor(sr * 0.05));
  return buffer;
}

// Additive electric-piano-ish tone: upper harmonics die away faster.
function renderKeys(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(sr * 3), sr);
  const out = buffer.getChannelData(0);
  const f = midiToFreq(60);
  const partials = [1, 0.45, 0.3, 0.18, 0.1, 0.06, 0.04, 0.025];
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    let v = 0;
    partials.forEach((amp, k) => {
      v += amp * Math.exp(-t * (0.9 + k * 0.9)) * Math.sin(2 * Math.PI * f * (k + 1) * t);
    });
    out[i] = v * Math.min(1, t / 0.004);
  }
  normalize(out);
  fadeOut(out, Math.floor(sr * 0.05));
  return buffer;
}

// Three detuned band-limited saws with a slow swell; loop it for a pad.
function renderPad(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(sr * 3), sr);
  const out = buffer.getChannelData(0);
  const table = new Float32Array(2048);
  for (let k = 1; k <= 24; k++) {
    for (let i = 0; i < table.length; i++) table[i] += Math.sin((2 * Math.PI * k * i) / table.length) / k;
  }
  const base = midiToFreq(60);
  const voices = [-9, 0, 9].map((cents) => ({ inc: (base * Math.pow(2, cents / 1200) * table.length) / sr, phase: Math.random() * table.length }));
  for (let i = 0; i < out.length; i++) {
    let v = 0;
    for (const voice of voices) {
      const j = Math.floor(voice.phase);
      const frac = voice.phase - j;
      v += table[j] + (table[(j + 1) % table.length] - table[j]) * frac;
      voice.phase = (voice.phase + voice.inc) % table.length;
    }
    out[i] = v * Math.min(1, i / (sr * 0.35));
  }
  normalize(out, 0.7);
  return buffer;
}

export const BUILT_IN_SAMPLES: BuiltInSample[] = [
  { id: `${BUILTIN_PREFIX}pluck`, name: 'Pluck', root: 48, render: renderPluck },
  { id: `${BUILTIN_PREFIX}keys`, name: 'Keys', root: 60, render: renderKeys },
  { id: `${BUILTIN_PREFIX}pad`, name: 'Pad', root: 60, render: renderPad },
];

const cache = new WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer | null>>>();

// Built-ins are rendered on first use; user samples are decoded from IndexedDB.
// Results are cached per context, so the module and the editor share one buffer.
export function loadSampleBuffer(ctx: BaseAudioContext, id: string): Promise<AudioBuffer | null> {
  let perCtx = cache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    cache.set(ctx, perCtx);
  }
  let pending = perCtx.get(id);
  if (!pending) {
    const builtIn = BUILT_IN_SAMPLES.find((s) => s.id === id);
    pending = builtIn
      ? Promise.resolve(builtIn.render(ctx))
      : getSample(id)
          .then((stored) => (stored ? ctx.decodeAudioData(stored.data.slice(0)) : null))
          .catch(() => null);
    perCtx.set(id, pending);
  }
  return pending;
}
