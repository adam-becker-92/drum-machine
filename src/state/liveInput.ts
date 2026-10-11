import { create } from 'zustand';
import { newNoteId } from '../audio/clips';
import { engine } from '../audio/core/engineInstance';
import { getNodeDefinition } from '../audio/core/nodeRegistry';
import { GRAPH_TAB, useProjectStore } from './projectStore';

// Live playing from any source (computer keys, on-screen keyboard, later MIDI):
// routes notes to an instrument, tracks what's held, and records into the clip
// while Rec is armed and the transport is running.

interface LiveState {
  held: number[];
  octave: number; // octave of the computer keyboard's A key (4 => C4)
  recordArmed: boolean;
}

export const useLiveStore = create<LiveState>(() => ({ held: [], octave: 4, recordArmed: false }));

export const DEFAULT_VELOCITY = 0.7;

interface HeldNote {
  target: string;
  velocity: number;
  startPosition: number | null;
}

const heldNotes = new Map<number, HeldNote>();

function publishHeld() {
  useLiveStore.setState({ held: [...heldNotes.keys()] });
}

// The instrument whose editor tab is in front, or the single selected instrument on the graph.
export function liveTarget(): string | null {
  const { activeTab, nodes } = useProjectStore.getState();
  const isPlayable = (id: string) => getNodeDefinition(nodes.find((n) => n.id === id)?.type)?.playable === true;
  if (activeTab !== GRAPH_TAB) return isPlayable(activeTab) ? activeTab : null;
  const selected = nodes.filter((n) => n.selected);
  return selected.length === 1 && isPlayable(selected[0].id) ? selected[0].id : null;
}

export function pressNote(pitch: number, velocity = DEFAULT_VELOCITY, target: string | null = liveTarget()) {
  if (!target || heldNotes.has(pitch)) return;
  engine.noteOn(target, pitch, velocity);
  heldNotes.set(pitch, { target, velocity, startPosition: engine.playheadPosition() });
  publishHeld();
}

export function releaseNote(pitch: number) {
  const held = heldNotes.get(pitch);
  if (!held) return;
  heldNotes.delete(pitch);
  engine.noteOff(held.target, pitch);
  publishHeld();
  const end = engine.playheadPosition();
  if (useLiveStore.getState().recordArmed && held.startPosition !== null && end !== null) {
    recordNote(held.target, pitch, held.velocity, held.startPosition, end);
  }
}

export function releaseAllNotes() {
  for (const pitch of [...heldNotes.keys()]) releaseNote(pitch);
}

// Overdub a played note into the target's clip, quantised to the 16th grid.
export function recordNote(target: string, pitch: number, velocity: number, startPosition: number, endPosition: number) {
  const { clips, setNotes } = useProjectStore.getState();
  const clip = clips[target];
  if (clip?.kind !== 'notes') return;
  const startStep = Math.round(startPosition);
  const start = ((startStep % clip.length) + clip.length) % clip.length;
  const length = Math.min(clip.length - start, Math.max(1, Math.round(endPosition - startPosition)));
  const others = clip.notes.filter((n) => !(n.pitch === pitch && n.start === start));
  setNotes(target, [...others, { id: newNoteId(), pitch, start, length, velocity }]);
}
