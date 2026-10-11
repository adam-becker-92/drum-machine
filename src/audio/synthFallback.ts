// Placeholder 909-ish voices synthesized directly from Web Audio primitives
// (oscillators, filtered noise, gain envelopes). Swap in real samples via
// /public/samples and these are never called again for that track.

const noiseBufferCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBufferCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noiseBufferCache.set(ctx, buffer);
  }
  return buffer;
}

interface ToneOptions {
  startFreq: number;
  endFreq?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

function playTone(ctx: BaseAudioContext, dest: AudioNode, time: number, opts: ToneOptions) {
  const { startFreq, endFreq = startFreq, duration, type = 'sine', gain = 1 } = opts;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, time);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), time + duration);
  env.gain.setValueAtTime(gain, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.connect(env).connect(dest);
  osc.start(time);
  osc.stop(time + duration + 0.02);
}

interface NoiseOptions {
  duration: number;
  filterType?: BiquadFilterType;
  frequency?: number;
  Q?: number;
  gain?: number;
}

function playNoise(ctx: BaseAudioContext, dest: AudioNode, time: number, opts: NoiseOptions) {
  const { duration, filterType = 'bandpass', frequency = 1000, Q = 1, gain = 1 } = opts;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.Q.value = Q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + duration);
  src.connect(filter).connect(env).connect(dest);
  src.start(time);
  src.stop(time + duration + 0.02);
}

type Voice = (ctx: BaseAudioContext, dest: AudioNode, time: number) => void;

export const SYNTH_FALLBACKS: Record<string, Voice> = {
  bd: (ctx, dest, time) => {
    playTone(ctx, dest, time, { startFreq: 150, endFreq: 45, duration: 0.3, type: 'sine', gain: 1.2 });
  },
  sd: (ctx, dest, time) => {
    playTone(ctx, dest, time, { startFreq: 220, endFreq: 180, duration: 0.12, type: 'triangle', gain: 0.5 });
    playNoise(ctx, dest, time, { duration: 0.18, filterType: 'bandpass', frequency: 1800, Q: 0.8, gain: 0.7 });
  },
  lt: (ctx, dest, time) => {
    playTone(ctx, dest, time, { startFreq: 150, endFreq: 90, duration: 0.25, type: 'sine', gain: 0.9 });
  },
  mt: (ctx, dest, time) => {
    playTone(ctx, dest, time, { startFreq: 210, endFreq: 130, duration: 0.22, type: 'sine', gain: 0.9 });
  },
  ht: (ctx, dest, time) => {
    playTone(ctx, dest, time, { startFreq: 280, endFreq: 180, duration: 0.2, type: 'sine', gain: 0.9 });
  },
  rs: (ctx, dest, time) => {
    playNoise(ctx, dest, time, { duration: 0.05, filterType: 'highpass', frequency: 2000, Q: 2, gain: 0.8 });
    playTone(ctx, dest, time, { startFreq: 1800, duration: 0.03, type: 'square', gain: 0.3 });
  },
  cp: (ctx, dest, time) => {
    [0, 0.01, 0.02].forEach((offset) => {
      playNoise(ctx, dest, time + offset, { duration: 0.05, filterType: 'bandpass', frequency: 1100, Q: 1.5, gain: 0.6 });
    });
    playNoise(ctx, dest, time + 0.03, { duration: 0.25, filterType: 'bandpass', frequency: 1100, Q: 1.2, gain: 0.5 });
  },
  ch: (ctx, dest, time) => {
    playNoise(ctx, dest, time, { duration: 0.05, filterType: 'highpass', frequency: 7000, Q: 0.7, gain: 0.5 });
  },
  oh: (ctx, dest, time) => {
    playNoise(ctx, dest, time, { duration: 0.35, filterType: 'highpass', frequency: 6000, Q: 0.7, gain: 0.45 });
  },
  cr: (ctx, dest, time) => {
    playNoise(ctx, dest, time, { duration: 1.2, filterType: 'highpass', frequency: 4000, Q: 0.5, gain: 0.5 });
  },
  rd: (ctx, dest, time) => {
    playNoise(ctx, dest, time, { duration: 0.6, filterType: 'bandpass', frequency: 5000, Q: 0.6, gain: 0.35 });
    playTone(ctx, dest, time, { startFreq: 800, duration: 0.5, type: 'sine', gain: 0.15 });
  },
};

export function playSynthFallback(trackId: string, ctx: BaseAudioContext, dest: AudioNode, time: number) {
  SYNTH_FALLBACKS[trackId]?.(ctx, dest, time);
}
