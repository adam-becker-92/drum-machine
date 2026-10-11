import type { Pattern } from '../types';

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

interface BaseParamSpec {
  key: string;
  label: string;
  // Editors lay knobs out in labelled sections by group (e.g. "Filter").
  group?: string;
}

export interface NumberParamSpec extends BaseParamSpec {
  kind: 'number';
  min: number;
  max: number;
  default: number;
  step?: number;
  unit?: string;
  // 'log' maps knob travel exponentially, which feels right for frequencies and times.
  scale?: 'linear' | 'log';
}

export interface SelectParamSpec extends BaseParamSpec {
  kind: 'select';
  options: { value: string; label: string }[];
  default: string;
}

export interface BoolParamSpec extends BaseParamSpec {
  kind: 'bool';
  default: boolean;
}

export type ParamSpec = NumberParamSpec | SelectParamSpec | BoolParamSpec;

export interface DrumClip {
  kind: 'drum';
  pattern: Pattern;
}

// Times are in 16th-note steps from the start of the clip.
export interface Note {
  id: string;
  pitch: number; // MIDI note number
  start: number;
  length: number;
  velocity: number; // 0..1
}

export interface NoteClip {
  kind: 'notes';
  length: number; // steps: 16, 32 or 64
  notes: Note[];
}

export type Clip = DrumClip | NoteClip;

export interface Preset {
  name: string;
  params: Params;
}

// Every box on the Synth Graph is backed by one AudioModule. Edges connect a
// module's `output` to one of another module's `inputs` (handle `in-<index>`).
export interface AudioModule {
  readonly inputs: AudioNode[];
  readonly output: AudioNode | null;
  setParams(params: Params): void;
  setBpm?(bpm: number): void;
  setClip?(clip: Clip): void;
  // Called by the global Transport for every 16th note; `step` counts up from 0
  // since play was pressed, so modules wrap it to their own clip length.
  scheduleStep?(step: number, time: number): void;
  // Transport stopped: silence anything still sounding and forget pending note-offs.
  onStop?(): void;
  // Playable instruments (live keys, MIDI in).
  noteOn?(pitch: number, velocity: number, time: number): void;
  noteOff?(pitch: number, time: number): void;
  dispose(): void;
}

export type NodeCategory = 'source' | 'effect' | 'utility' | 'output';

export interface NodeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  description: string;
  icon: string;
  color: string;
  inputs: string[];
  hasOutput: boolean;
  params: ParamSpec[];
  // Param keys rendered as knobs directly on the graph node.
  inlineParams: string[];
  // Only one instance allowed (e.g. the master Output).
  singleton?: boolean;
  // Responds to noteOn/noteOff and gets a piano roll + live keys in its editor.
  playable?: boolean;
  presets?: Preset[];
  extraDefaults?: () => Params;
  createClip?: () => Clip;
  create(ctx: AudioContext): AudioModule;
}

export function inputHandleId(index: number): string {
  return `in-${index}`;
}

export function inputIndexFromHandle(handle: string | null | undefined): number {
  const match = /^in-(\d+)$/.exec(handle ?? '');
  return match ? Number(match[1]) : 0;
}

export const OUTPUT_HANDLE = 'out';
