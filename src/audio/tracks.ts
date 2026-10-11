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

export function createEmptyPattern(): Pattern {
  const pattern: Pattern = {};
  for (const track of TRACKS) {
    pattern[track.id] = new Array(STEP_COUNT).fill(false);
  }
  return pattern;
}
