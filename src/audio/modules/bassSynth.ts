import { Envelope, midiToFreq, num, setSmooth, str } from '../dsp';
import type { Params } from '../core/types';
import { NoteInstrument } from './instrument';

// Notes at or above this velocity are accented (louder, brighter, snappier).
export const ACCENT_VELOCITY = 0.8;
const PEAK = 0.26;

// TB-303-style monosynth: one always-running oscillator into two stacked
// low-pass biquads (~24 dB/oct). Overlapping notes slide instead of
// retriggering, like the 303's slide; held notes use last-note priority.
export class BassSynthModule extends NoteInstrument {
  readonly output: GainNode;
  private osc: OscillatorNode;
  private filter1: BiquadFilterNode;
  private filter2: BiquadFilterNode;
  private amp: GainNode;
  private envSource: ConstantSourceNode;
  private ampEnv: Envelope;
  private filterEnv: Envelope;
  private params: Params = {};
  private held: number[] = [];

  constructor(ctx: AudioContext) {
    super(ctx);
    this.osc = ctx.createOscillator();
    this.filter1 = ctx.createBiquadFilter();
    this.filter2 = ctx.createBiquadFilter();
    this.filter1.type = 'lowpass';
    this.filter2.type = 'lowpass';
    this.amp = ctx.createGain();
    this.output = ctx.createGain();
    this.osc.connect(this.filter1).connect(this.filter2).connect(this.amp).connect(this.output);

    // One envelope signal (in cents) sweeps both filter stages together.
    this.envSource = ctx.createConstantSource();
    this.envSource.connect(this.filter1.detune);
    this.envSource.connect(this.filter2.detune);

    this.ampEnv = new Envelope(this.amp.gain);
    this.filterEnv = new Envelope(this.envSource.offset);
    this.osc.start();
    this.envSource.start();
  }

  setParams(p: Params) {
    this.params = p;
    this.osc.type = str(p.wave, 'sawtooth') as OscillatorType;
    setSmooth(this.osc.detune, num(p.tune, 0) * 100, this.ctx);
    setSmooth(this.filter1.frequency, num(p.cutoff, 380), this.ctx);
    setSmooth(this.filter2.frequency, num(p.cutoff, 380), this.ctx);
    const resonance = num(p.resonance, 12);
    setSmooth(this.filter1.Q, Math.min(resonance, 4) * 0.5, this.ctx);
    setSmooth(this.filter2.Q, resonance, this.ctx);
    setSmooth(this.output.gain, num(p.volume, 0.8), this.ctx);
  }

  private glideTo(pitch: number, time: number) {
    const slide = Math.max(0.005, num(this.params.slide, 0.06));
    this.osc.frequency.cancelScheduledValues(time);
    this.osc.frequency.setTargetAtTime(midiToFreq(pitch), time, slide / 3);
  }

  noteOn(pitch: number, velocity: number, time: number) {
    const legato = this.held.length > 0;
    this.held.push(pitch);
    if (legato) {
      this.glideTo(pitch, time);
      return;
    }
    const p = this.params;
    const accent = velocity >= ACCENT_VELOCITY ? num(p.accent, 0.6) : 0;
    this.osc.frequency.cancelScheduledValues(time);
    this.osc.frequency.setValueAtTime(midiToFreq(pitch), time);
    this.ampEnv.trigger(time, PEAK * (0.55 + 0.45 * velocity) * (1 + accent * 0.6), {
      attack: 0.003,
      decay: 1.2,
      sustain: 0.7,
      release: 0.03,
    });
    // The 303 filter envelope always decays to nothing; accents hit harder and faster.
    this.filterEnv.trigger(time, num(p.envMod, 0.6) * 3600 + accent * 1800, {
      attack: 0.003,
      decay: num(p.decay, 0.4) * (1 - accent * 0.5),
      sustain: 0,
      release: 0.1,
    });
  }

  noteOff(pitch: number, time: number) {
    const index = this.held.lastIndexOf(pitch);
    if (index < 0) return;
    const wasCurrent = index === this.held.length - 1;
    this.held.splice(index, 1);
    if (this.held.length === 0) {
      this.ampEnv.release(time, 0.03);
    } else if (wasCurrent) {
      this.glideTo(this.held[this.held.length - 1], time);
    }
  }

  protected releaseAll(time: number) {
    this.held = [];
    this.ampEnv.release(time, 0.03);
  }

  dispose() {
    this.osc.stop();
    this.envSource.stop();
    for (const node of [this.osc, this.filter1, this.filter2, this.amp, this.envSource, this.output]) node.disconnect();
  }
}
