import type { Pattern } from '../types';

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export interface NumberParamSpec {
  key: string;
  label: string;
  kind: 'number';
  min: number;
  max: number;
  default: number;
  step?: number;
  unit?: string;
  // 'log' maps knob travel exponentially, which feels right for frequencies and times.
  scale?: 'linear' | 'log';
}

export interface SelectParamSpec {
  key: string;
  label: string;
  kind: 'select';
  options: { value: string; label: string }[];
  default: string;
}

export interface BoolParamSpec {
  key: string;
  label: string;
  kind: 'bool';
  default: boolean;
}

export type ParamSpec = NumberParamSpec | SelectParamSpec | BoolParamSpec;

export interface DrumClip {
  kind: 'drum';
  pattern: Pattern;
}

export type Clip = DrumClip;

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
