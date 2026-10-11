import { loadSample } from './sampleLoader';
import { playSynthFallback } from './synthFallback';
import { STEP_COUNT, TRACKS } from './tracks';
import type { Pattern } from './types';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_TIME = 0.1;

export class DrumEngine {
  readonly ctx: AudioContext;
  private masterGain: GainNode;
  private buffers = new Map<string, AudioBuffer | null>();
  private pattern: Pattern = {};
  private bpm = 120;

  private timerId: number | null = null;
  private drawFrameId: number | null = null;
  private currentStep = 0;
  private nextStepTime = 0;
  private notesInQueue: { step: number; time: number }[] = [];
  private lastDrawnStep = -1;
  private onStepChange?: (step: number) => void;

  constructor() {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
  }

  async loadSamples(): Promise<void> {
    await Promise.all(
      TRACKS.map(async (track) => {
        const buffer = await loadSample(this.ctx, track.sampleFile);
        this.buffers.set(track.id, buffer);
      }),
    );
  }

  setPattern(pattern: Pattern) {
    this.pattern = pattern;
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
  }

  setOnStepChange(cb: (step: number) => void) {
    this.onStepChange = cb;
  }

  private secondsPerStep(): number {
    return 60 / this.bpm / 4; // 16th notes
  }

  private triggerTrack(trackId: string, time: number) {
    const buffer = this.buffers.get(trackId);
    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.masterGain);
      source.start(time);
    } else {
      playSynthFallback(trackId, this.ctx, this.masterGain, time);
    }
  }

  private scheduleStep(step: number, time: number) {
    for (const track of TRACKS) {
      if (this.pattern[track.id]?.[step]) {
        this.triggerTrack(track.id, time);
      }
    }
    this.notesInQueue.push({ step, time });
  }

  private scheduler = () => {
    while (this.nextStepTime < this.ctx.currentTime + SCHEDULE_AHEAD_TIME) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += this.secondsPerStep();
      this.currentStep = (this.currentStep + 1) % STEP_COUNT;
    }
    this.timerId = window.setTimeout(this.scheduler, LOOKAHEAD_MS);
  };

  private draw = () => {
    const currentTime = this.ctx.currentTime;
    let drawStep = this.lastDrawnStep;
    while (this.notesInQueue.length && this.notesInQueue[0].time <= currentTime) {
      drawStep = this.notesInQueue[0].step;
      this.notesInQueue.shift();
    }
    if (drawStep !== this.lastDrawnStep) {
      this.lastDrawnStep = drawStep;
      this.onStepChange?.(drawStep);
    }
    this.drawFrameId = requestAnimationFrame(this.draw);
  };

  async start() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.currentStep = 0;
    this.lastDrawnStep = -1;
    this.notesInQueue = [];
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.scheduler();
    this.draw();
  }

  stop() {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.drawFrameId !== null) {
      cancelAnimationFrame(this.drawFrameId);
      this.drawFrameId = null;
    }
    this.onStepChange?.(-1);
  }
}
