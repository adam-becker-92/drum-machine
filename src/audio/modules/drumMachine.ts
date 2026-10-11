import { DelayUnit, ReverbUnit, divisionSeconds, driveCurve, num, setSmooth, str } from '../dsp';
import { loadSample } from '../sampleLoader';
import { playSynthFallback } from '../synthFallback';
import { STEP_COUNT, TRACKS } from '../tracks';
import type { Pattern } from '../types';
import type { AudioModule, Clip, Params } from '../core/types';

// Per-voice params live in the node's flat params map as `v.<trackId>.<field>`.
export const VOICE_FIELDS = {
  level: 0.9,
  pan: 0,
  drive: 0,
  filterType: 'lowpass',
  cutoff: 20000,
  resonance: 0,
  reverb: 0,
  delay: 0,
  mute: false,
} as const;

export type VoiceField = keyof typeof VOICE_FIELDS;

export function voiceKey(trackId: string, field: VoiceField): string {
  return `v.${trackId}.${field}`;
}

export function defaultVoiceParams(): Params {
  const params: Params = {};
  for (const track of TRACKS) {
    for (const [field, value] of Object.entries(VOICE_FIELDS)) {
      params[voiceKey(track.id, field as VoiceField)] = value;
    }
  }
  return params;
}

export function starterPattern(): Pattern {
  const pattern: Pattern = {};
  for (const track of TRACKS) {
    pattern[track.id] = new Array(STEP_COUNT).fill(false);
  }
  for (const s of [0, 4, 8, 12]) pattern.bd[s] = true;
  for (const s of [4, 12]) pattern.cp[s] = true;
  for (const s of [2, 6, 10, 14]) pattern.ch[s] = true;
  return pattern;
}

// input -> drive -> filter -> level -> pan -> drum bus, with post-fader sends
// from the pan stage into the drum machine's shared reverb and delay.
class VoiceStrip {
  readonly input: GainNode;
  private shaper: WaveShaperNode;
  private filter: BiquadFilterNode;
  private level: GainNode;
  private panner: StereoPannerNode;
  private reverbSend: GainNode;
  private delaySend: GainNode;
  muted = false;
  private ctx: AudioContext;

  constructor(ctx: AudioContext, bus: AudioNode, reverb: AudioNode, delay: AudioNode) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '2x';
    this.filter = ctx.createBiquadFilter();
    this.level = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.reverbSend = ctx.createGain();
    this.delaySend = ctx.createGain();
    this.reverbSend.gain.value = 0;
    this.delaySend.gain.value = 0;

    this.input.connect(this.shaper).connect(this.filter).connect(this.level).connect(this.panner);
    this.panner.connect(bus);
    this.panner.connect(this.reverbSend).connect(reverb);
    this.panner.connect(this.delaySend).connect(delay);
  }

  apply(params: Params, trackId: string) {
    const get = (field: VoiceField) => params[voiceKey(trackId, field)] ?? VOICE_FIELDS[field];
    const drive = num(get('drive'), 0);
    this.shaper.curve = driveCurve(drive);
    this.filter.type = str(get('filterType'), 'lowpass') as BiquadFilterType;
    setSmooth(this.filter.frequency, num(get('cutoff'), 20000), this.ctx);
    setSmooth(this.filter.Q, num(get('resonance'), 0), this.ctx);
    // Drive adds a lot of level, so pull the fader back to compensate.
    setSmooth(this.level.gain, num(get('level'), 0.9) / (1 + drive * 1.5), this.ctx);
    setSmooth(this.panner.pan, num(get('pan'), 0), this.ctx);
    setSmooth(this.reverbSend.gain, num(get('reverb'), 0), this.ctx);
    setSmooth(this.delaySend.gain, num(get('delay'), 0), this.ctx);
    this.muted = get('mute') === true;
  }

  dispose() {
    for (const node of [this.input, this.shaper, this.filter, this.level, this.panner, this.reverbSend, this.delaySend]) {
      node.disconnect();
    }
  }
}

export class DrumMachineModule implements AudioModule {
  readonly inputs: AudioNode[] = [];
  readonly output: GainNode;
  private ctx: AudioContext;
  private buffers = new Map<string, AudioBuffer | null>();
  private voices = new Map<string, VoiceStrip>();
  private reverb: ReverbUnit;
  private delay: DelayUnit;
  private pattern: Pattern = {};
  private params: Params = {};
  private bpm = 120;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.reverb = new ReverbUnit(ctx);
    this.delay = new DelayUnit(ctx);
    this.reverb.output.connect(this.output);
    this.delay.output.connect(this.output);
    for (const track of TRACKS) {
      this.voices.set(track.id, new VoiceStrip(ctx, this.output, this.reverb.input, this.delay.input));
    }
    for (const track of TRACKS) {
      loadSample(ctx, track.sampleFile).then((buffer) => this.buffers.set(track.id, buffer));
    }
  }

  setParams(params: Params) {
    this.params = params;
    for (const [trackId, voice] of this.voices) voice.apply(params, trackId);
    this.reverb.configure(num(params.reverbSize, 1.8), num(params.reverbDecay, 3));
    this.applyDelay();
    setSmooth(this.output.gain, num(params.volume, 1), this.ctx);
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
    this.applyDelay();
  }

  private applyDelay() {
    this.delay.configure(
      divisionSeconds(str(this.params.delayTime, '3/16'), this.bpm),
      num(this.params.delayFeedback, 0.35),
      num(this.params.delayTone, 4000),
    );
  }

  setClip(clip: Clip) {
    if (clip.kind === 'drum') this.pattern = clip.pattern;
  }

  scheduleStep(step: number, time: number) {
    const s = step % STEP_COUNT;
    for (const track of TRACKS) {
      if (this.pattern[track.id]?.[s]) this.trigger(track.id, time);
    }
  }

  // Also used directly by the editor to audition a voice.
  trigger(trackId: string, time = this.ctx.currentTime) {
    const voice = this.voices.get(trackId);
    if (!voice || voice.muted) return;
    const buffer = this.buffers.get(trackId);
    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(voice.input);
      source.start(time);
    } else {
      playSynthFallback(trackId, this.ctx, voice.input, time);
    }
  }

  dispose() {
    for (const voice of this.voices.values()) voice.dispose();
    this.reverb.dispose();
    this.delay.dispose();
    this.output.disconnect();
  }
}
