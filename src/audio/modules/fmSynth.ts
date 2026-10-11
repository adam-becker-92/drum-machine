import { Envelope, midiToFreq, num, setSmooth, type Adsr } from '../dsp';
import type { Params } from '../core/types';
import { NoteInstrument } from './instrument';

const MAX_VOICES = 12;
const VOICE_PEAK = 0.25;

function modAdsr(p: Params): Adsr {
  return { attack: num(p.modAttack, 0.005), decay: num(p.modDecay, 0.8), sustain: num(p.modSustain, 0.25), release: num(p.modRelease, 0.5) };
}

function ampAdsr(p: Params): Adsr {
  return { attack: num(p.attack, 0.005), decay: num(p.decay, 1.2), sustain: num(p.sustain, 0.4), release: num(p.release, 0.6) };
}

// Two-operator FM: a sine modulator at `ratio` x the note frequency swings the
// carrier's frequency by `index` x the modulator frequency. The modulator's own
// envelope shapes the brightness over time; that's where FM's character lives.
class FmVoice {
  readonly pitch: number;
  released = false;
  private carrier: OscillatorNode;
  private modulator: OscillatorNode;
  private nodes: AudioNode[];
  private modEnv: Envelope;
  private ampEnv: Envelope;

  constructor(
    ctx: AudioContext,
    dest: AudioNode,
    pitch: number,
    velocity: number,
    time: number,
    p: Params,
    onEnded: (voice: FmVoice) => void,
  ) {
    this.pitch = pitch;
    const freq = midiToFreq(pitch);
    const modFreq = freq * num(p.ratio, 1);

    this.carrier = ctx.createOscillator();
    this.carrier.frequency.value = freq;
    this.carrier.detune.value = num(p.detune, 0);
    this.modulator = ctx.createOscillator();
    this.modulator.frequency.value = modFreq;
    const depth = ctx.createGain();
    const amp = ctx.createGain();
    this.modulator.connect(depth).connect(this.carrier.frequency);
    this.carrier.connect(amp).connect(dest);
    this.nodes = [this.carrier, this.modulator, depth, amp];

    // Harder hits are brighter, as on a DX7 with velocity-sensitive modulators.
    const index = num(p.index, 3) * (0.4 + 0.6 * velocity);
    this.modEnv = new Envelope(depth.gain);
    this.ampEnv = new Envelope(amp.gain);
    this.modEnv.trigger(time, index * modFreq, modAdsr(p));
    this.ampEnv.trigger(time, VOICE_PEAK * (0.35 + 0.65 * velocity), ampAdsr(p));

    this.carrier.start(time);
    this.modulator.start(time);
    this.carrier.onended = () => {
      for (const node of this.nodes) node.disconnect();
      onEnded(this);
    };
  }

  release(time: number) {
    if (this.released) return;
    this.released = true;
    this.stopAt(Math.max(this.ampEnv.release(time), this.modEnv.release(time)));
  }

  kill(time: number) {
    this.released = true;
    this.ampEnv.release(time, 0.006);
    this.stopAt(time + 0.03);
  }

  private stopAt(time: number) {
    this.carrier.stop(time);
    this.modulator.stop(time);
  }
}

export class FmSynthModule extends NoteInstrument {
  readonly output: GainNode;
  private voices: FmVoice[] = [];
  private params: Params = {};

  constructor(ctx: AudioContext) {
    super(ctx);
    this.output = ctx.createGain();
  }

  setParams(p: Params) {
    this.params = p;
    setSmooth(this.output.gain, num(p.volume, 0.8), this.ctx);
  }

  noteOn(pitch: number, velocity: number, time: number) {
    if (this.voices.length >= MAX_VOICES) {
      const victim = this.voices.find((v) => v.released) ?? this.voices[0];
      this.voices.splice(this.voices.indexOf(victim), 1);
      victim.kill(time);
    }
    this.voices.push(
      new FmVoice(this.ctx, this.output, pitch, velocity, time, this.params, (ended) => {
        const index = this.voices.indexOf(ended);
        if (index >= 0) this.voices.splice(index, 1);
      }),
    );
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
    this.output.disconnect();
  }
}
