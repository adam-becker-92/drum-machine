const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_TIME = 0.1;

// Global lookahead clock (the classic "tale of two clocks" pattern): a JS timer
// wakes up every LOOKAHEAD_MS and schedules any 16th notes falling inside the
// next SCHEDULE_AHEAD_TIME seconds on the sample-accurate AudioContext clock.
export class Transport {
  private ctx: AudioContext;
  private onSchedule: (step: number, time: number) => void;
  private onStepChange: (step: number) => void;
  private bpm = 120;
  private timerId: number | null = null;
  private drawFrameId: number | null = null;
  private currentStep = 0;
  private nextStepTime = 0;
  private notesInQueue: { step: number; time: number }[] = [];
  private lastDrawnStep = -1;

  constructor(
    ctx: AudioContext,
    onSchedule: (step: number, time: number) => void,
    onStepChange: (step: number) => void,
  ) {
    this.ctx = ctx;
    this.onSchedule = onSchedule;
    this.onStepChange = onStepChange;
  }

  get isRunning(): boolean {
    return this.timerId !== null;
  }

  setBpm(bpm: number) {
    this.bpm = bpm;
  }

  private secondsPerStep(): number {
    return 60 / this.bpm / 4; // 16th notes
  }

  private scheduler = () => {
    while (this.nextStepTime < this.ctx.currentTime + SCHEDULE_AHEAD_TIME) {
      this.onSchedule(this.currentStep, this.nextStepTime);
      this.notesInQueue.push({ step: this.currentStep, time: this.nextStepTime });
      this.nextStepTime += this.secondsPerStep();
      this.currentStep++;
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
      this.onStepChange(drawStep);
    }
    this.drawFrameId = requestAnimationFrame(this.draw);
  };

  async start() {
    if (this.isRunning) return;
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
    this.onStepChange(-1);
  }
}
