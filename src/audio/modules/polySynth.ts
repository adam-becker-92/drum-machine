import { Envelope, midiToFreq, num, setSmooth, str, type Adsr } from '../dsp';
import { getNoiseBuffer } from '../synthFallback';
import type { Params } from '../core/types';
import { NoteInstrument } from './instrument';

const MAX_VOICES = 8;
// Per-voice peak level, leaving headroom for full chords.
const VOICE_PEAK = 0.34;
// Filter envelope range at full amount: four octaves, applied in cents via detune.
const FILTER_ENV_CENTS = 4800;

function wave(value: unknown, fallback: OscillatorType): OscillatorType {
  return str(value, fallback) as OscillatorType;
}

// The shared LFO may already be fully disconnected when the module was disposed.
function unpatch(from: AudioNode, to: AudioParam) {
  try {
    from.disconnect(to);
  } catch {
    // not connected any more
  }
}

function ampAdsr(p: Params): Adsr {
  return { attack: num(p.attack, 0.01), decay: num(p.decay, 0.3), sustain: num(p.sustain, 0.7), release: num(p.release, 0.4) };
}

function filterAdsr(p: Params): Adsr {
  return { attack: num(p.fAttack, 0.01), decay: num(p.fDecay, 0.4), sustain: num(p.fSustain, 0.3), release: num(p.fRelease, 0.4) };
}

// osc1 + osc2 + noise -> resonant low-pass (env on detune) -> amp env.
class PolyVoice {
  readonly pitch: number;
  released = false;
  // When the voice will have stopped sounding (Infinity while held).
  endTime = Infinity;
  private ctx: BaseAudioContext;
  private osc1: OscillatorNode;
  private osc2: OscillatorNode;
  private noise: AudioBufferSourceNode;
  private filter: BiquadFilterNode;
  private nodes: AudioNode[];
  private ampEnv: Envelope;
  private filterEnv: Envelope;
  private lfoPitch: AudioNode;
  private lfoFilter: AudioNode;

  constructor(
    ctx: BaseAudioContext,
    dest: AudioNode,
    lfoPitch: AudioNode,
    lfoFilter: AudioNode,
    pitch: number,
    velocity: number,
    time: number,
    p: Params,
    onEnded: (voice: PolyVoice) => void,
  ) {
    this.ctx = ctx;
    this.pitch = pitch;
    this.lfoPitch = lfoPitch;
    this.lfoFilter = lfoFilter;
    const freq = midiToFreq(pitch);

    this.osc1 = ctx.createOscillator();
    this.osc1.frequency.value = freq;
    this.osc2 = ctx.createOscillator();
    this.osc2.frequency.value = freq;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = getNoiseBuffer(ctx);
    this.noise.loop = true;

    const mix = num(p.oscMix, 0.5);
    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    const gn = ctx.createGain();
    g1.gain.value = 1 - mix;
    g2.gain.value = mix;
    gn.gain.value = num(p.noise, 0) * 0.5;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    const amp = ctx.createGain();

    this.osc1.connect(g1).connect(this.filter);
    this.osc2.connect(g2).connect(this.filter);
    this.noise.connect(gn).connect(this.filter);
    this.filter.connect(amp).connect(dest);
    lfoPitch.connect(this.osc1.detune);
    lfoPitch.connect(this.osc2.detune);
    lfoFilter.connect(this.filter.detune);
    this.nodes = [this.osc1, this.osc2, this.noise, g1, g2, gn, this.filter, amp];

    this.applyLive(p, true);
    this.filterEnv = new Envelope(this.filter.detune);
    this.ampEnv = new Envelope(amp.gain);
    this.filterEnv.trigger(time, num(p.envAmount, 0.5) * FILTER_ENV_CENTS, filterAdsr(p));
    this.ampEnv.trigger(time, VOICE_PEAK * (0.35 + 0.65 * velocity), ampAdsr(p));

    for (const src of [this.osc1, this.osc2, this.noise]) src.start(time);
    this.osc1.onended = () => {
      unpatch(this.lfoPitch, this.osc1.detune);
      unpatch(this.lfoPitch, this.osc2.detune);
      unpatch(this.lfoFilter, this.filter.detune);
      for (const node of this.nodes) node.disconnect();
      onEnded(this);
    };
  }

  // Params that can follow knob changes while the note is held. A new voice
  // sets them instantly so notes don't start with a little sweep.
  applyLive(p: Params, immediate = false) {
    this.osc1.type = wave(p.osc1Wave, 'sawtooth');
    this.osc2.type = wave(p.osc2Wave, 'sawtooth');
    const set = (param: AudioParam, value: number) =>
      immediate ? (param.value = value) : setSmooth(param, value, this.ctx);
    set(this.osc2.detune, num(p.osc2Semi, 0) * 100 + num(p.osc2Fine, 7));
    set(this.filter.frequency, num(p.cutoff, 1800));
    set(this.filter.Q, num(p.resonance, 2));
  }

  release(time: number) {
    if (this.released) return;
    this.released = true;
    const end = Math.max(this.ampEnv.release(time), this.filterEnv.release(time));
    this.stopAt(end);
  }

  // Voice stealing: fade out fast to avoid a click.
  kill(time: number) {
    this.released = true;
    this.ampEnv.release(time, 0.006);
    this.stopAt(time + 0.03);
  }

  private stopAt(time: number) {
    this.endTime = time;
    for (const src of [this.osc1, this.osc2, this.noise]) src.stop(time);
  }
}

export class PolySynthModule extends NoteInstrument {
  readonly output: GainNode;
  private voices: PolyVoice[] = [];
  private params: Params = {};
  private lfo: OscillatorNode;
  private lfoPitch: GainNode;
  private lfoFilter: GainNode;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.output = ctx.createGain();
    this.lfo = ctx.createOscillator();
    this.lfoPitch = ctx.createGain();
    this.lfoFilter = ctx.createGain();
    this.lfoPitch.gain.value = 0;
    this.lfoFilter.gain.value = 0;
    this.lfo.connect(this.lfoPitch);
    this.lfo.connect(this.lfoFilter);
    this.lfo.start();
  }

  setParams(p: Params) {
    this.params = p;
    const target = str(p.lfoTarget, 'off');
    const depth = num(p.lfoDepth, 0.3);
    setSmooth(this.lfo.frequency, num(p.lfoRate, 5), this.ctx);
    setSmooth(this.lfoPitch.gain, target === 'pitch' ? depth * 60 : 0, this.ctx);
    setSmooth(this.lfoFilter.gain, target === 'cutoff' ? depth * 2400 : 0, this.ctx);
    setSmooth(this.output.gain, num(p.volume, 0.8), this.ctx);
    for (const voice of this.voices) voice.applyLive(p);
  }

  noteOn(pitch: number, velocity: number, time: number) {
    // Voices that will have finished by then don't count (matters when a whole
    // song is scheduled up front for an offline render).
    this.voices = this.voices.filter((v) => v.endTime > time);
    if (this.voices.length >= MAX_VOICES) {
      const victim = this.voices.find((v) => v.released) ?? this.voices[0];
      this.voices.splice(this.voices.indexOf(victim), 1);
      victim.kill(time);
    }
    const voice = new PolyVoice(
      this.ctx,
      this.output,
      this.lfoPitch,
      this.lfoFilter,
      pitch,
      velocity,
      time,
      this.params,
      (ended) => {
        const index = this.voices.indexOf(ended);
        if (index >= 0) this.voices.splice(index, 1);
      },
    );
    this.voices.push(voice);
  }

  noteOff(pitch: number, time: number) {
    this.voices.find((v) => v.pitch === pitch && !v.released)?.release(time);
  }

  protected releaseAll(time: number) {
    for (const voice of this.voices) voice.release(time);
  }

  dispose() {
    for (const voice of this.voices) voice.kill(this.ctx.currentTime);
    this.voices = [];
    this.lfo.stop();
    for (const node of [this.lfo, this.lfoPitch, this.lfoFilter, this.output]) node.disconnect();
  }
}
