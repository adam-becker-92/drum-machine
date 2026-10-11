import { DelayUnit, ReverbUnit, divisionSeconds, driveCurve, mixGains, num, setSmooth, str } from '../dsp';
import type { AudioModule, Params } from '../core/types';

function disconnectAll(nodes: AudioNode[]) {
  for (const node of nodes) node.disconnect();
}

export class FilterModule implements AudioModule {
  readonly inputs: AudioNode[];
  readonly output: BiquadFilterNode;
  private ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.output = ctx.createBiquadFilter();
    this.inputs = [this.output];
  }

  setParams(p: Params) {
    this.output.type = str(p.type, 'lowpass') as BiquadFilterType;
    setSmooth(this.output.frequency, num(p.cutoff, 2000), this.ctx);
    setSmooth(this.output.Q, num(p.resonance, 1), this.ctx);
  }

  dispose() {
    this.output.disconnect();
  }
}

// Shared dry/wet scaffolding: input -> dry -> output, input -> [effect] -> wet -> output.
abstract class WetDryModule implements AudioModule {
  readonly inputs: AudioNode[];
  readonly output: GainNode;
  protected ctx: BaseAudioContext;
  protected input: GainNode;
  protected dry: GainNode;
  protected wet: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.dry).connect(this.output);
    this.wet.connect(this.output);
    this.inputs = [this.input];
  }

  protected applyMix(mix: number) {
    const { dry, wet } = mixGains(mix);
    setSmooth(this.dry.gain, dry, this.ctx);
    setSmooth(this.wet.gain, wet, this.ctx);
  }

  abstract setParams(params: Params): void;

  dispose() {
    disconnectAll([this.input, this.dry, this.wet, this.output]);
  }
}

export class ReverbModule extends WetDryModule {
  private reverb: ReverbUnit;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.reverb = new ReverbUnit(ctx);
    this.input.connect(this.reverb.input);
    this.reverb.output.connect(this.wet);
  }

  setParams(p: Params) {
    this.reverb.configure(num(p.size, 2.5), num(p.decay, 3));
    this.applyMix(num(p.mix, 0.3));
  }

  dispose() {
    super.dispose();
    this.reverb.dispose();
  }
}

export class DelayModule extends WetDryModule {
  private delay: DelayUnit;
  private params: Params = {};
  private bpm = 120;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.delay = new DelayUnit(ctx);
    this.input.connect(this.delay.input);
    this.delay.output.connect(this.wet);
  }

  setParams(p: Params) {
    this.params = p;
    this.applyMix(num(p.mix, 0.3));
    this.applyTime();
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
    this.applyTime();
  }

  private applyTime() {
    const p = this.params;
    this.delay.configure(divisionSeconds(str(p.time, '3/16'), this.bpm), num(p.feedback, 0.4), num(p.tone, 5000));
  }

  dispose() {
    super.dispose();
    this.delay.dispose();
  }
}

export class DistortionModule extends WetDryModule {
  private shaper: WaveShaperNode;
  private tone: BiquadFilterNode;
  private trim: GainNode;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '4x';
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.trim = ctx.createGain();
    this.input.connect(this.shaper).connect(this.tone).connect(this.trim).connect(this.wet);
  }

  setParams(p: Params) {
    const drive = num(p.drive, 0.4);
    this.shaper.curve = driveCurve(drive);
    setSmooth(this.tone.frequency, num(p.tone, 6000), this.ctx);
    setSmooth(this.trim.gain, 1 / (1 + drive * 2), this.ctx);
    this.applyMix(num(p.mix, 1));
    setSmooth(this.output.gain, num(p.level, 1), this.ctx);
  }

  dispose() {
    super.dispose();
    disconnectAll([this.shaper, this.tone, this.trim]);
  }
}

export class CompressorModule implements AudioModule {
  readonly inputs: AudioNode[];
  readonly output: GainNode;
  private comp: DynamicsCompressorNode;
  private ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.output = ctx.createGain();
    this.comp.connect(this.output);
    this.inputs = [this.comp];
  }

  setParams(p: Params) {
    setSmooth(this.comp.threshold, num(p.threshold, -18), this.ctx);
    setSmooth(this.comp.ratio, num(p.ratio, 4), this.ctx);
    setSmooth(this.comp.attack, num(p.attack, 0.01), this.ctx);
    setSmooth(this.comp.release, num(p.release, 0.2), this.ctx);
    setSmooth(this.output.gain, Math.pow(10, num(p.makeup, 0) / 20), this.ctx);
  }

  dispose() {
    disconnectAll([this.comp, this.output]);
  }
}

export class GainPanModule implements AudioModule {
  readonly inputs: AudioNode[];
  readonly output: StereoPannerNode;
  private gain: GainNode;
  private ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.output = ctx.createStereoPanner();
    this.gain.connect(this.output);
    this.inputs = [this.gain];
  }

  setParams(p: Params) {
    setSmooth(this.gain.gain, num(p.gain, 1), this.ctx);
    setSmooth(this.output.pan, num(p.pan, 0), this.ctx);
  }

  dispose() {
    disconnectAll([this.gain, this.output]);
  }
}

export const MIXER_CHANNELS = 4;

export class MixerModule implements AudioModule {
  readonly inputs: GainNode[];
  readonly output: GainNode;
  private ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.inputs = Array.from({ length: MIXER_CHANNELS }, () => {
      const ch = ctx.createGain();
      ch.connect(this.output);
      return ch;
    });
  }

  setParams(p: Params) {
    this.inputs.forEach((ch, i) => setSmooth(ch.gain, num(p[`ch${i + 1}`], 0.8), this.ctx));
    setSmooth(this.output.gain, num(p.master, 1), this.ctx);
  }

  dispose() {
    disconnectAll([...this.inputs, this.output]);
  }
}

// The sink of the graph: volume -> (optional brickwall-ish limiter) -> speakers,
// with an analyser tapped after the limiter so scopes show what you hear.
export class OutputModule implements AudioModule {
  readonly inputs: AudioNode[];
  readonly output = null;
  readonly analyser: AnalyserNode;
  private gain: GainNode;
  private limiter: DynamicsCompressorNode;
  private post: GainNode;
  private limiting: boolean | null = null;
  private ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.1;
    this.post = ctx.createGain();
    this.limiter.connect(this.post);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.post.connect(this.analyser);
    this.post.connect(ctx.destination);
    this.inputs = [this.gain];
  }

  setParams(p: Params) {
    setSmooth(this.gain.gain, num(p.volume, 0.8), this.ctx);
    const limiting = p.limiter !== false;
    if (limiting !== this.limiting) {
      this.limiting = limiting;
      this.gain.disconnect();
      this.gain.connect(limiting ? this.limiter : this.post);
    }
  }

  dispose() {
    disconnectAll([this.gain, this.limiter, this.post, this.analyser]);
  }
}
