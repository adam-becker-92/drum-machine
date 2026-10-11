import type { Clip, Note, NoteClip } from './core/types';

export const CLIP_LENGTHS = [16, 32, 64];

export function newNoteId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// Compact authoring for starter clips: [start, pitch, length, velocity].
export function noteClip(length: number, notes: [number, number, number, number][] = []): NoteClip {
  return {
    kind: 'notes',
    length,
    notes: notes.map(([start, pitch, len, velocity]) => ({ id: newNoteId(), start, pitch, length: len, velocity })),
  };
}

// Keeps notes inside the clip and in sane ranges (after drags, imports, length changes).
export function normalizeNotes(notes: Note[], clipLength: number): Note[] {
  return notes
    .filter((n) => n.start >= 0 && n.start < clipLength)
    .map((n) => ({
      ...n,
      start: Math.round(n.start),
      pitch: Math.min(127, Math.max(0, Math.round(n.pitch))),
      length: Math.min(clipLength - Math.round(n.start), Math.max(1, Math.round(n.length))),
      velocity: Math.min(1, Math.max(0.05, n.velocity)),
    }));
}

export function describeClip(clip: Clip): string {
  if (clip.kind === 'notes') return `${clip.length / 16} bar${clip.length > 16 ? 's' : ''} · ${clip.notes.length} notes`;
  const hits = Object.values(clip.pattern).reduce((n, steps) => n + steps.filter(Boolean).length, 0);
  return `drums · ${hits} hits`;
}
