import { Envelope, num, setSmooth, str, type Adsr } from '../dsp';
import { loadSampleBuffer } from '../sampleLibrary';
import type { Params } from '../core/types';
import { NoteInstrument } from './instrument';

const MAX_VOICES = 16;
const VOICE_PEAK = 0.5;

function ampAdsr(p: Params): Adsr {
  return { attack: num(p.attack, 0.003), decay: num(p.decay, 0.5), sustain: num(p.sustain, 1), release: num(p.release, 0.3) };
}

class SamplerVoice {
  readonly pitch: number;
  released = false;
  private source: AudioBufferSourceNode;
  private amp: GainNode;
  private env: Envelope;

  constructor(
    ctx: AudioContext,
    dest: AudioNode,
    buffer: AudioBuffer,
    pitch: number,
    velocity: number,
    time: number,
    p: Params,
    onEnded: (voice: SamplerVoice) => void,
  ) {
    this.pitch = pitch;
    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.playbackRate.value = Math.pow(2, (pitch - num(p.root, 60)) / 12);
    this.source.detune.value = num(p.tune, 0) * 100 + num(p.fine, 0);
    const offset = Math.min(0.99, num(p.start, 0)) * buffer.duration;
    if (p.loop === true) {
      this.source.loop = true;
      this.source.loopStart = offset;
      this.source.loopEnd = buffer.duration;
    }
    this.amp = ctx.createGain();
    this.source.connect(this.amp).connect(dest);
    this.env = new Envelope(this.amp.gain);
    this.env.trigger(time, VOICE_PEAK * (0.3 + 0.7 * velocity), ampAdsr(p));
    this.source.start(time, offset);
    this.source.onended = () => {
      this.source.disconnect();
      this.amp.disconnect();
      onEnded(this);
    };
  }

  release(time: number) {
    if (this.released) return;
    this.released = true;
    this.source.stop(this.env.release(time));
  }

  kill(time: number) {
    this.released = true;
    this.env.release(time, 0.006);
    this.source.stop(time + 0.03);
  }
}

// Plays one sample pitched across the keyboard (playbackRate relative to the
// root note), through a shared low-pass filter.
export class SamplerModule extends NoteInstrument {
  readonly output: GainNode;
  private filter: BiquadFilterNode;
  private voices: SamplerVoice[] = [];
  private params: Params = {};
  private buffer: AudioBuffer | null = null;
  private sampleId: string | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.output = ctx.createGain();
    this.filter.connect(this.output);
  }

  setParams(p: Params) {
    this.params = p;
    const id = str(p.sampleId, '');
    if (id !== this.sampleId) {
      this.sampleId = id;
      this.buffer = null;
      if (id) {
        void loadSampleBuffer(this.ctx, id).then((buffer) => {
          if (this.sampleId === id) this.buffer = buffer;
        });
      }
    }
    setSmooth(this.filter.frequency, num(p.cutoff, 18000), this.ctx);
    setSmooth(this.filter.Q, num(p.resonance, 0.7), this.ctx);
    setSmooth(this.output.gain, num(p.volume, 0.8), this.ctx);
  }

  noteOn(pitch: number, velocity: number, time: number) {
    if (!this.buffer) return;
    if (this.voices.length >= MAX_VOICES) {
      const victim = this.voices.find((v) => v.released) ?? this.voices[0];
      this.voices.splice(this.voices.indexOf(victim), 1);
      victim.kill(time);
    }
    this.voices.push(
      new SamplerVoice(this.ctx, this.filter, this.buffer, pitch, velocity, time, this.params, (ended) => {
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
    this.filter.disconnect();
    this.output.disconnect();
  }
}
