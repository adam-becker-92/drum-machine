import type { AudioModule, Clip, NoteClip, Params } from '../core/types';

// Base for playable instruments: plays a NoteClip from the global Transport and
// exposes noteOn/noteOff for live keys and MIDI.
//
// Note-offs are tracked by absolute step rather than looked up in the clip when
// they fall due, so editing or deleting a note while it sounds can't leave it
// hanging.
export abstract class NoteInstrument implements AudioModule {
  readonly inputs: AudioNode[] = [];
  abstract readonly output: AudioNode;
  protected ctx: BaseAudioContext;
  protected bpm = 120;
  private clip: NoteClip = { kind: 'notes', length: 16, notes: [] };
  private pendingOffs: { step: number; pitch: number }[] = [];

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  abstract setParams(params: Params): void;
  abstract noteOn(pitch: number, velocity: number, time: number): void;
  abstract noteOff(pitch: number, time: number): void;
  // Release every sounding voice (transport stop, panic).
  protected abstract releaseAll(time: number): void;
  abstract dispose(): void;

  setBpm(bpm: number) {
    this.bpm = bpm;
  }

  setClip(clip: Clip) {
    if (clip.kind === 'notes') this.clip = clip;
  }

  scheduleStep(step: number, time: number) {
    // Offs first, so back-to-back notes retrigger while overlapping ones stay legato.
    if (this.pendingOffs.length) {
      const due = this.pendingOffs.filter((off) => off.step <= step);
      if (due.length) {
        this.pendingOffs = this.pendingOffs.filter((off) => off.step > step);
        for (const off of due) this.noteOff(off.pitch, time);
      }
    }
    const position = step % this.clip.length;
    for (const note of this.clip.notes) {
      if (note.start !== position) continue;
      this.noteOn(note.pitch, note.velocity, time);
      this.pendingOffs.push({ step: step + Math.max(1, note.length), pitch: note.pitch });
    }
  }

  onStop(time = this.ctx.currentTime) {
    this.pendingOffs = [];
    this.releaseAll(time);
  }
}
