import { Midi } from '@tonejs/midi';
import { CLIP_LENGTHS, newNoteId, normalizeNotes } from '../audio/clips';
import type { Clip, DrumClip, Note, NoteClip } from '../audio/core/types';
import { GM_DRUM_NOTES, STEP_COUNT, TRACKS, trackForDrumNote } from '../audio/tracks';

const DRUM_CHANNEL = 9; // MIDI channel 10, zero-based

function clipLength(clip: Clip): number {
  return clip.kind === 'notes' ? clip.length : STEP_COUNT;
}

export interface MidiExportTrack {
  name: string;
  clip: Clip;
}

// One track per clip; drums go on channel 10 with General MIDI note numbers.
// Clips repeat to the length of the longest one so they line up as they play.
export function clipsToMidi(tracks: MidiExportTrack[], bpm: number): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const ticksPerStep = midi.header.ppq / 4;
  const total = Math.max(STEP_COUNT, ...tracks.map((t) => clipLength(t.clip)));
  let melodicChannel = 0;

  for (const { name, clip } of tracks) {
    const track = midi.addTrack();
    track.name = name;
    const length = clipLength(clip);
    if (clip.kind === 'drum') {
      track.channel = DRUM_CHANNEL;
      for (let offset = 0; offset < total; offset += length) {
        for (const { id } of TRACKS) {
          clip.pattern[id]?.forEach((on, step) => {
            if (on) {
              track.addNote({ midi: GM_DRUM_NOTES[id], ticks: (offset + step) * ticksPerStep, durationTicks: ticksPerStep, velocity: 0.8 });
            }
          });
        }
      }
    } else {
      track.channel = melodicChannel;
      melodicChannel = melodicChannel + 1 === DRUM_CHANNEL ? melodicChannel + 2 : (melodicChannel + 1) % 16;
      for (let offset = 0; offset < total; offset += length) {
        for (const note of clip.notes) {
          track.addNote({
            midi: note.pitch,
            ticks: (offset + note.start) * ticksPerStep,
            durationTicks: note.length * ticksPerStep,
            velocity: note.velocity,
          });
        }
      }
    }
  }
  return midi.toArray();
}

export interface MidiTrackInfo {
  index: number;
  name: string;
  noteCount: number;
  percussion: boolean;
}

export interface ParsedMidi {
  midi: Midi;
  tracks: MidiTrackInfo[]; // only tracks that contain notes
}

export function readMidi(data: ArrayBuffer): ParsedMidi {
  const midi = new Midi(data);
  const tracks = midi.tracks
    .map((track, index) => ({
      index,
      name: track.name || `Track ${index + 1}`,
      noteCount: track.notes.length,
      percussion: track.channel === DRUM_CHANNEL || track.instrument.percussion,
    }))
    .filter((t) => t.noteCount > 0);
  return { midi, tracks };
}

export interface ImportResult<T extends Clip> {
  clip: T;
  imported: number;
  skipped: number; // beyond the longest clip we support, or no matching drum voice
}

// Quantises a track's notes to 16ths, picking the shortest clip length (1/2/4 bars) that fits.
export function midiTrackToNoteClip(parsed: ParsedMidi, index: number): ImportResult<NoteClip> {
  const ticksPerStep = parsed.midi.header.ppq / 4;
  const maxLength = CLIP_LENGTHS[CLIP_LENGTHS.length - 1];
  const notes: Note[] = [];
  let skipped = 0;
  for (const n of parsed.midi.tracks[index]?.notes ?? []) {
    const start = Math.round(n.ticks / ticksPerStep);
    if (start >= maxLength) {
      skipped++;
      continue;
    }
    notes.push({
      id: newNoteId(),
      pitch: n.midi,
      start,
      length: Math.max(1, Math.round(n.durationTicks / ticksPerStep)),
      velocity: n.velocity,
    });
  }
  const end = Math.max(1, ...notes.map((n) => n.start + n.length));
  const length = CLIP_LENGTHS.find((l) => l >= end) ?? maxLength;
  return { clip: { kind: 'notes', length, notes: normalizeNotes(notes, length) }, imported: notes.length, skipped };
}

// Takes the first bar of a drum track, mapping General MIDI notes onto the 909 voices.
export function midiTrackToDrumClip(parsed: ParsedMidi, index: number): ImportResult<DrumClip> {
  const ticksPerStep = parsed.midi.header.ppq / 4;
  const pattern: Record<string, boolean[]> = {};
  for (const { id } of TRACKS) pattern[id] = new Array(STEP_COUNT).fill(false);
  let imported = 0;
  let skipped = 0;
  for (const n of parsed.midi.tracks[index]?.notes ?? []) {
    const step = Math.round(n.ticks / ticksPerStep);
    const track = trackForDrumNote(n.midi);
    if (!track || step >= STEP_COUNT) {
      skipped++;
      continue;
    }
    pattern[track][step] = true;
    imported++;
  }
  return { clip: { kind: 'drum', pattern }, imported, skipped };
}
