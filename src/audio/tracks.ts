import type { Pattern, Track } from './types';

export const STEP_COUNT = 16;

// Classic TR-909 voice layout. Drop matching audio files into /public/samples
// (e.g. bd.wav, sd.wav, ...) to replace the synthesized placeholder sounds.
export const TRACKS: Track[] = [
  { id: 'bd', name: 'Bass Drum', shortName: 'BD', sampleFile: 'bd.wav' },
  { id: 'sd', name: 'Snare Drum', shortName: 'SD', sampleFile: 'sd.wav' },
  { id: 'lt', name: 'Low Tom', shortName: 'LT', sampleFile: 'lt.wav' },
  { id: 'mt', name: 'Mid Tom', shortName: 'MT', sampleFile: 'mt.wav' },
  { id: 'ht', name: 'Hi Tom', shortName: 'HT', sampleFile: 'ht.wav' },
  { id: 'rs', name: 'Rim Shot', shortName: 'RS', sampleFile: 'rs.wav' },
  { id: 'cp', name: 'Hand Clap', shortName: 'CP', sampleFile: 'cp.wav' },
  { id: 'ch', name: 'Closed Hi-Hat', shortName: 'CH', sampleFile: 'ch.wav' },
  { id: 'oh', name: 'Open Hi-Hat', shortName: 'OH', sampleFile: 'oh.wav' },
  { id: 'cr', name: 'Crash Cymbal', shortName: 'CR', sampleFile: 'cr.wav' },
  { id: 'rd', name: 'Ride Cymbal', shortName: 'RD', sampleFile: 'rd.wav' },
];

// General MIDI drum notes (channel 10), as used by Roland's TR-8/909 MIDI maps.
export const GM_DRUM_NOTES: Record<string, number> = {
  bd: 36, rs: 37, sd: 38, cp: 39, ch: 42, lt: 43, oh: 46, mt: 47, cr: 49, ht: 50, rd: 51,
};

// Other common GM drum notes folded onto the nearest 909 voice.
const DRUM_NOTE_ALIASES: Record<number, string> = {
  35: 'bd', 40: 'sd', 41: 'lt', 44: 'ch', 45: 'lt', 48: 'mt', 52: 'cr', 53: 'rd', 55: 'cr', 57: 'cr', 59: 'rd',
};

export function trackForDrumNote(note: number): string | undefined {
  return Object.keys(GM_DRUM_NOTES).find((id) => GM_DRUM_NOTES[id] === note) ?? DRUM_NOTE_ALIASES[note];
}

export function createEmptyPattern(): Pattern {
  const pattern: Pattern = {};
  for (const track of TRACKS) {
    pattern[track.id] = new Array(STEP_COUNT).fill(false);
  }
  return pattern;
}
