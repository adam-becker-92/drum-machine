import { DelayUnit, ReverbUnit, divisionSeconds, driveCurve, num, setSmooth, str } from '../dsp';
import { loadSampleBuffer } from '../sampleLibrary';
import { loadSample } from '../sampleLoader';
import { playSynthFallback } from '../synthFallback';
import { STEP_COUNT, TRACKS, trackForDrumNote } from '../tracks';
import type { Pattern } from '../types';
import type { AudioModule, Clip, ParamSpec, Params } from '../core/types';

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
  // A user sample (sample library id) replacing the built-in sound; '' = built-in.
  sample: '',
  sampleName: '',
} as const;

export type VoiceField = keyof typeof VOICE_FIELDS;

// Knob specs for the per-voice strip (keys are VoiceFields).
export const VOICE_SPECS: (ParamSpec & { key: VoiceField })[] = [
  { key: 'level', label: 'Level', kind: 'number', min: 0, max: 1.5, default: VOICE_FIELDS.level },
  { key: 'pan', label: 'Pan', kind: 'number', min: -1, max: 1, default: VOICE_FIELDS.pan },
  { key: 'drive', label: 'Drive', kind: 'number', min: 0, max: 1, default: VOICE_FIELDS.drive },
  {
    key: 'filterType',
    label: 'Filter',
    kind: 'select',
    options: [
      { value: 'lowpass', label: 'LP' },
      { value: 'highpass', label: 'HP' },
      { value: 'bandpass', label: 'BP' },
    ],
    default: VOICE_FIELDS.filterType,
  },
  { key: 'cutoff', label: 'Cutoff', kind: 'number', min: 20, max: 20000, default: VOICE_FIELDS.cutoff, unit: 'Hz', scale: 'log' },
  { key: 'resonance', label: 'Res', kind: 'number', min: 0, max: 20, default: VOICE_FIELDS.resonance },
  { key: 'reverb', label: 'Reverb', kind: 'number', min: 0, max: 1, default: VOICE_FIELDS.reverb },
  { key: 'delay', label: 'Delay', kind: 'number', min: 0, max: 1, default: VOICE_FIELDS.delay },
];

// The spec behind a `v.<track>.<field>` param key (for MIDI mapping).
export function voiceSpecForKey(key: string): ParamSpec | undefined {
  const field = /^v\.[a-z]+\.(\w+)$/.exec(key)?.[1];
  return VOICE_SPECS.find((spec) => spec.key === field);
}

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
  private ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext, bus: AudioNode, reverb: AudioNode, delay: AudioNode) {
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
  private ctx: BaseAudioContext;
  private buffers = new Map<string, AudioBuffer | null>();
  // Per-voice user samples, by track: the library id and its decoded buffer.
  private custom = new Map<string, { id: string; buffer: AudioBuffer | null }>();
  private loads: Promise<unknown>[] = [];
  private voices = new Map<string, VoiceStrip>();
  private reverb: ReverbUnit;
  private delay: DelayUnit;
  private pattern: Pattern = {};
  private params: Params = {};
  private bpm = 120;

  constructor(ctx: BaseAudioContext) {
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
      this.loads.push(loadSample(ctx, track.sampleFile).then((buffer) => this.buffers.set(track.id, buffer)));
    }
  }

  whenReady(): Promise<void> {
    return Promise.all(this.loads).then(() => undefined);
  }

  private applyCustomSamples(params: Params) {
    for (const track of TRACKS) {
      const id = str(params[voiceKey(track.id, 'sample')], '');
      if (id === (this.custom.get(track.id)?.id ?? '')) continue;
      if (!id) {
        this.custom.delete(track.id);
        continue;
      }
      const entry = { id, buffer: null as AudioBuffer | null };
      this.custom.set(track.id, entry);
      this.loads.push(loadSampleBuffer(this.ctx, id).then((buffer) => (entry.buffer = buffer)));
    }
  }

  setParams(params: Params) {
    this.params = params;
    this.applyCustomSamples(params);
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

  // Live hits from MIDI pads / keys, using the General MIDI drum map.
  noteOn(pitch: number, velocity: number, time: number) {
    const track = trackForDrumNote(pitch);
    if (track) this.trigger(track, time, velocity);
  }

  noteOff() {
    // Drum hits are one-shots.
  }

  // Also used directly by the editor to audition a voice.
  trigger(trackId: string, time = this.ctx.currentTime, velocity = 1) {
    const voice = this.voices.get(trackId);
    if (!voice || voice.muted) return;
    let dest: AudioNode = voice.input;
    if (velocity < 1) {
      const hit = this.ctx.createGain();
      hit.gain.value = 0.25 + 0.75 * velocity;
      hit.connect(voice.input);
      dest = hit;
    }
    const buffer = this.custom.get(trackId)?.buffer ?? this.buffers.get(trackId);
    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(dest);
      source.start(time);
    } else {
      playSynthFallback(trackId, this.ctx, dest, time);
    }
  }

  dispose() {
    for (const voice of this.voices.values()) voice.dispose();
    this.reverb.dispose();
    this.delay.dispose();
    this.output.disconnect();
  }
}
