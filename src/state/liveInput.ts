import { create } from 'zustand';
import { newNoteId } from '../audio/clips';
import { engine } from '../audio/core/engineInstance';
import { getNodeDefinition } from '../audio/core/nodeRegistry';
import { STEP_COUNT, trackForDrumNote } from '../audio/tracks';
import { GRAPH_TAB, useProjectStore } from './projectStore';

// Live playing from any source (computer keys, on-screen keys, MIDI): routes
// notes to an instrument, tracks what's held, and records into the clip while
// Rec is armed and the transport is running.

export type LiveSource = 'keys' | 'mouse' | 'midi';

interface LiveState {
  held: Record<string, number[]>; // target node id -> pitches currently held
  octave: number; // octave of the computer keyboard's A key (4 => C4)
  recordArmed: boolean;
}

export const useLiveStore = create<LiveState>(() => ({ held: {}, octave: 4, recordArmed: false }));

export const DEFAULT_VELOCITY = 0.7;
export const NO_HELD: number[] = [];

interface HeldNote {
  source: LiveSource;
  target: string;
  pitch: number;
  velocity: number;
  startPosition: number | null;
}

const heldNotes = new Map<string, HeldNote>();

const keyOf = (source: LiveSource, target: string, pitch: number) => `${source}:${target}:${pitch}`;

function publishHeld() {
  const held: Record<string, number[]> = {};
  for (const note of heldNotes.values()) (held[note.target] ??= []).push(note.pitch);
  useLiveStore.setState({ held });
}

export function isPlayableNode(id: string): boolean {
  const node = useProjectStore.getState().nodes.find((n) => n.id === id);
  return getNodeDefinition(node?.type)?.playable === true;
}

// The instrument whose editor tab is in front, or the single selected instrument on the graph.
export function liveTarget(): string | null {
  const { activeTab, nodes } = useProjectStore.getState();
  if (activeTab !== GRAPH_TAB) return isPlayableNode(activeTab) ? activeTab : null;
  const selected = nodes.filter((n) => n.selected);
  return selected.length === 1 && isPlayableNode(selected[0].id) ? selected[0].id : null;
}

export function pressNote(pitch: number, velocity: number, target: string, source: LiveSource) {
  const key = keyOf(source, target, pitch);
  if (heldNotes.has(key)) return;
  engine.noteOn(target, pitch, velocity);
  heldNotes.set(key, { source, target, pitch, velocity, startPosition: engine.playheadPosition() });
  publishHeld();
}

function release(key: string) {
  const held = heldNotes.get(key);
  if (!held) return;
  heldNotes.delete(key);
  engine.noteOff(held.target, held.pitch);
  publishHeld();
  const end = engine.playheadPosition();
  if (useLiveStore.getState().recordArmed && held.startPosition !== null && end !== null) {
    recordNote(held.target, held.pitch, held.velocity, held.startPosition, end);
  }
}

export function releaseNote(pitch: number, target: string, source: LiveSource) {
  release(keyOf(source, target, pitch));
}

// Release everything a source is holding (keys on window blur, MIDI when switched off).
export function releaseSource(source: LiveSource) {
  for (const [key, note] of heldNotes) if (note.source === source) release(key);
}

// Overdub a played note into the target's clip, quantised to the 16th grid.
// Drum machines get the hit's step switched on instead.
export function recordNote(target: string, pitch: number, velocity: number, startPosition: number, endPosition: number) {
  const { clips, setNotes, setDrumStep } = useProjectStore.getState();
  const clip = clips[target];
  if (!clip) return;
  const length = clip.kind === 'notes' ? clip.length : STEP_COUNT;
  const startStep = Math.round(startPosition);
  const start = ((startStep % length) + length) % length;
  if (clip.kind === 'drum') {
    const track = trackForDrumNote(pitch);
    if (track) setDrumStep(target, track, start, true);
    return;
  }
  const noteLength = Math.min(length - start, Math.max(1, Math.round(endPosition - startPosition)));
  const others = clip.notes.filter((n) => !(n.pitch === pitch && n.start === start));
  setNotes(target, [...others, { id: newNoteId(), pitch, start, length: noteLength, velocity }]);
}
