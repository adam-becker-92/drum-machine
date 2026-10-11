// Small reusable Web Audio building blocks shared by the drum voice strips and
// the standalone effect nodes.

const SMOOTHING = 0.015;

export function setSmooth(param: AudioParam, value: number, ctx: BaseAudioContext) {
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value, ctx.currentTime, SMOOTHING);
}

export function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

// Exponentially decaying stereo noise: a cheap but convincing room/plate.
export function buildImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

const curveCache = new Map<number, Float32Array<ArrayBuffer>>();

// Soft-clip curve; amount 0 returns null so the WaveShaper is a clean pass-through.
export function driveCurve(amount: number): Float32Array<ArrayBuffer> | null {
  const key = Math.round(amount * 100) / 100;
  if (key <= 0) return null;
  let curve = curveCache.get(key);
  if (!curve) {
    const k = key * 60;
    const samples = 2048;
    curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    curveCache.set(key, curve);
  }
  return curve;
}

export const DELAY_DIVISIONS = [
  { value: '1/16', label: '1/16', beats: 0.25 },
  { value: '1/8', label: '1/8', beats: 0.5 },
  { value: '3/16', label: '3/16', beats: 0.75 },
  { value: '1/4', label: '1/4', beats: 1 },
  { value: '3/8', label: '3/8', beats: 1.5 },
  { value: '1/2', label: '1/2', beats: 2 },
];

export function divisionSeconds(division: string, bpm: number): number {
  const beats = DELAY_DIVISIONS.find((d) => d.value === division)?.beats ?? 0.75;
  return (60 / bpm) * beats;
}

export class ReverbUnit {
  readonly input: GainNode;
  readonly output: GainNode;
  private convolver: ConvolverNode;
  private size = -1;
  private decay = -1;
  private ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.output = ctx.createGain();
    this.input.connect(this.convolver).connect(this.output);
    this.configure(2, 3);
  }

  configure(size: number, decay: number) {
    if (size === this.size && decay === this.decay) return;
    this.size = size;
    this.decay = decay;
    this.convolver.buffer = buildImpulse(this.ctx, size, decay);
  }

  dispose() {
    this.input.disconnect();
    this.convolver.disconnect();
    this.output.disconnect();
  }
}

// Feedback delay with a low-pass in the loop so repeats darken over time.
export class DelayUnit {
  readonly input: GainNode;
  readonly output: GainNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private tone: BiquadFilterNode;
  private ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.delay = ctx.createDelay(4);
    this.feedback = ctx.createGain();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.output = ctx.createGain();
    this.input.connect(this.delay);
    this.delay.connect(this.tone);
    this.tone.connect(this.feedback).connect(this.delay);
    this.tone.connect(this.output);
  }

  configure(seconds: number, feedback: number, toneHz: number) {
    setSmooth(this.delay.delayTime, Math.min(seconds, 4), this.ctx);
    setSmooth(this.feedback.gain, Math.min(feedback, 0.95), this.ctx);
    setSmooth(this.tone.frequency, toneHz, this.ctx);
  }

  dispose() {
    for (const node of [this.input, this.delay, this.feedback, this.tone, this.output]) {
      node.disconnect();
    }
  }
}

// Equal-power dry/wet crossfade.
export function mixGains(mix: number): { dry: number; wet: number } {
  const m = Math.min(1, Math.max(0, mix));
  return { dry: Math.cos((m * Math.PI) / 2), wet: Math.sin((m * Math.PI) / 2) };
}

export function midiToFreq(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(pitch: number): string {
  return `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}

export interface Adsr {
  attack: number;
  decay: number;
  sustain: number; // 0..1 of the way from base to peak
  release: number;
}

const MIN_TIME = 0.002;

// Drives one AudioParam through attack -> decay -> sustain, and releases from
// wherever the curve really is at release time. Releases are often scheduled
// ahead (clip note-offs), possibly mid-attack, so the envelope keeps an
// analytic model of its own curve instead of reading param.value.
export class Envelope {
  private param: AudioParam;
  private base = 0;
  private peak = 1;
  private startValue = 0;
  private start = -1;
  private adsr: Adsr = { attack: MIN_TIME, decay: 0.1, sustain: 1, release: 0.1 };
  private releaseAt = Infinity;
  private releaseValue = 0;
  private releaseTau = 0.03;

  constructor(param: AudioParam, base = 0) {
    this.param = param;
    this.base = base;
    this.startValue = base;
    param.value = base;
  }

  private sustainLevel(): number {
    return this.base + (this.peak - this.base) * this.adsr.sustain;
  }

  valueAt(t: number): number {
    if (this.start < 0 || t <= this.start) return this.start < 0 ? this.base : this.startValue;
    if (t >= this.releaseAt) {
      return this.base + (this.releaseValue - this.base) * Math.exp(-(t - this.releaseAt) / this.releaseTau);
    }
    const attack = Math.max(MIN_TIME, this.adsr.attack);
    if (t < this.start + attack) return this.startValue + (this.peak - this.startValue) * ((t - this.start) / attack);
    const tau = Math.max(MIN_TIME, this.adsr.decay) / 3;
    const s = this.sustainLevel();
    return s + (this.peak - s) * Math.exp(-(t - this.start - attack) / tau);
  }

  // Starts from the current value, so retriggering a sounding mono voice doesn't click.
  trigger(time: number, peak: number, adsr: Adsr) {
    const from = this.valueAt(time);
    this.startValue = from;
    this.start = time;
    this.peak = peak;
    this.adsr = adsr;
    this.releaseAt = Infinity;
    const attack = Math.max(MIN_TIME, adsr.attack);
    const p = this.param;
    p.cancelScheduledValues(time);
    p.setValueAtTime(from, time);
    p.linearRampToValueAtTime(peak, time + attack);
    p.setTargetAtTime(this.sustainLevel(), time + attack, Math.max(MIN_TIME, adsr.decay) / 3);
  }

  // Returns the time by which the release has effectively finished.
  release(time: number, releaseTime = this.adsr.release): number {
    if (this.start < 0) return time;
    const value = this.valueAt(time);
    const attack = Math.max(MIN_TIME, this.adsr.attack);
    const p = this.param;
    p.cancelScheduledValues(time);
    if (time < this.start + attack) {
      // Mid-attack: cancelling removed the attack ramp, so redraw it up to `time`.
      p.linearRampToValueAtTime(value, time);
    } else {
      p.setValueAtTime(value, time);
    }
    this.releaseTau = Math.max(MIN_TIME, releaseTime) / 3;
    p.setTargetAtTime(this.base, time, this.releaseTau);
    this.releaseAt = time;
    this.releaseValue = value;
    return time + this.releaseTau * 6;
  }
}
