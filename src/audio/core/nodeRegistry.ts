import { DELAY_DIVISIONS } from '../dsp';
import { DrumMachineModule, defaultVoiceParams, starterPattern } from '../modules/drumMachine';
import {
  CompressorModule,
  DelayModule,
  DistortionModule,
  FilterModule,
  GainPanModule,
  MIXER_CHANNELS,
  MixerModule,
  OutputModule,
  ReverbModule,
} from '../modules/effects';
import type { NodeCategory, NodeDefinition, Params } from './types';

const FILTER_TYPES = [
  { value: 'lowpass', label: 'LP' },
  { value: 'highpass', label: 'HP' },
  { value: 'bandpass', label: 'BP' },
  { value: 'notch', label: 'Notch' },
];

export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'drumMachine',
    label: 'Drum Machine',
    category: 'source',
    description: '909-style 11-voice step sequencer with per-voice filter, drive, pan and FX sends.',
    icon: '🥁',
    color: '#e8a33d',
    inputs: [],
    hasOutput: true,
    params: [
      { key: 'volume', label: 'Volume', kind: 'number', min: 0, max: 1.5, default: 1 },
      { key: 'reverbSize', label: 'Verb Size', kind: 'number', min: 0.2, max: 6, default: 1.8, unit: 's', scale: 'log' },
      { key: 'reverbDecay', label: 'Verb Decay', kind: 'number', min: 1, max: 8, default: 3 },
      { key: 'delayTime', label: 'Delay', kind: 'select', options: DELAY_DIVISIONS, default: '3/16' },
      { key: 'delayFeedback', label: 'Feedback', kind: 'number', min: 0, max: 0.95, default: 0.35 },
      { key: 'delayTone', label: 'Delay Tone', kind: 'number', min: 200, max: 18000, default: 4000, unit: 'Hz', scale: 'log' },
    ],
    inlineParams: ['volume'],
    extraDefaults: defaultVoiceParams,
    createClip: () => ({ kind: 'drum', pattern: starterPattern() }),
    create: (ctx) => new DrumMachineModule(ctx),
  },
  {
    type: 'filter',
    label: 'Filter',
    category: 'effect',
    description: 'Resonant biquad filter.',
    icon: '◢',
    color: '#4fa3e0',
    inputs: ['In'],
    hasOutput: true,
    params: [
      { key: 'type', label: 'Type', kind: 'select', options: FILTER_TYPES, default: 'lowpass' },
      { key: 'cutoff', label: 'Cutoff', kind: 'number', min: 20, max: 20000, default: 2000, unit: 'Hz', scale: 'log' },
      { key: 'resonance', label: 'Res', kind: 'number', min: 0.1, max: 20, default: 1, scale: 'log' },
    ],
    inlineParams: ['cutoff', 'resonance'],
    create: (ctx) => new FilterModule(ctx),
  },
  {
    type: 'reverb',
    label: 'Reverb',
    category: 'effect',
    description: 'Convolution reverb with a generated room impulse.',
    icon: '◌',
    color: '#9b7be0',
    inputs: ['In'],
    hasOutput: true,
    params: [
      { key: 'size', label: 'Size', kind: 'number', min: 0.2, max: 8, default: 2.5, unit: 's', scale: 'log' },
      { key: 'decay', label: 'Decay', kind: 'number', min: 1, max: 8, default: 3 },
      { key: 'mix', label: 'Mix', kind: 'number', min: 0, max: 1, default: 0.25 },
    ],
    inlineParams: ['size', 'mix'],
    create: (ctx) => new ReverbModule(ctx),
  },
  {
    type: 'delay',
    label: 'Delay',
    category: 'effect',
    description: 'Tempo-synced feedback delay with a darkening tone control.',
    icon: '⋯',
    color: '#5cc8a8',
    inputs: ['In'],
    hasOutput: true,
    params: [
      { key: 'time', label: 'Time', kind: 'select', options: DELAY_DIVISIONS, default: '3/16' },
      { key: 'feedback', label: 'Feedback', kind: 'number', min: 0, max: 0.95, default: 0.4 },
      { key: 'tone', label: 'Tone', kind: 'number', min: 200, max: 18000, default: 5000, unit: 'Hz', scale: 'log' },
      { key: 'mix', label: 'Mix', kind: 'number', min: 0, max: 1, default: 0.3 },
    ],
    inlineParams: ['feedback', 'mix'],
    create: (ctx) => new DelayModule(ctx),
  },
  {
    type: 'distortion',
    label: 'Distortion',
    category: 'effect',
    description: 'Soft-clip waveshaper with tone and output trim.',
    icon: '⚡',
    color: '#e0644f',
    inputs: ['In'],
    hasOutput: true,
    params: [
      { key: 'drive', label: 'Drive', kind: 'number', min: 0, max: 1, default: 0.4 },
      { key: 'tone', label: 'Tone', kind: 'number', min: 200, max: 18000, default: 6000, unit: 'Hz', scale: 'log' },
      { key: 'mix', label: 'Mix', kind: 'number', min: 0, max: 1, default: 1 },
      { key: 'level', label: 'Level', kind: 'number', min: 0, max: 2, default: 1 },
    ],
    inlineParams: ['drive', 'mix'],
    create: (ctx) => new DistortionModule(ctx),
  },
  {
    type: 'compressor',
    label: 'Compressor',
    category: 'effect',
    description: 'Dynamics compressor with makeup gain.',
    icon: '▤',
    color: '#d0c050',
    inputs: ['In'],
    hasOutput: true,
    params: [
      { key: 'threshold', label: 'Threshold', kind: 'number', min: -60, max: 0, default: -18, unit: 'dB' },
      { key: 'ratio', label: 'Ratio', kind: 'number', min: 1, max: 20, default: 4, scale: 'log' },
      { key: 'attack', label: 'Attack', kind: 'number', min: 0.001, max: 0.5, default: 0.01, unit: 's', scale: 'log' },
      { key: 'release', label: 'Release', kind: 'number', min: 0.02, max: 1, default: 0.2, unit: 's', scale: 'log' },
      { key: 'makeup', label: 'Makeup', kind: 'number', min: 0, max: 24, default: 0, unit: 'dB' },
    ],
    inlineParams: ['threshold', 'ratio'],
    create: (ctx) => new CompressorModule(ctx),
  },
  {
    type: 'gainPan',
    label: 'Gain / Pan',
    category: 'utility',
    description: 'Simple level and stereo position.',
    icon: '◐',
    color: '#8a8a90',
    inputs: ['In'],
    hasOutput: true,
    params: [
      { key: 'gain', label: 'Gain', kind: 'number', min: 0, max: 2, default: 1 },
      { key: 'pan', label: 'Pan', kind: 'number', min: -1, max: 1, default: 0 },
    ],
    inlineParams: ['gain', 'pan'],
    create: (ctx) => new GainPanModule(ctx),
  },
  {
    type: 'mixer',
    label: 'Mixer',
    category: 'utility',
    description: 'Sums four inputs with individual levels.',
    icon: '⊕',
    color: '#8a8a90',
    inputs: Array.from({ length: MIXER_CHANNELS }, (_, i) => `Ch ${i + 1}`),
    hasOutput: true,
    params: [
      ...Array.from({ length: MIXER_CHANNELS }, (_, i) => ({
        key: `ch${i + 1}`,
        label: `Ch ${i + 1}`,
        kind: 'number' as const,
        min: 0,
        max: 1.5,
        default: 0.8,
      })),
      { key: 'master', label: 'Master', kind: 'number', min: 0, max: 1.5, default: 1 },
    ],
    inlineParams: ['ch1', 'ch2', 'ch3', 'ch4'],
    create: (ctx) => new MixerModule(ctx),
  },
  {
    type: 'master',
    label: 'Output',
    category: 'output',
    description: 'Master output to your speakers, with a safety limiter to stop clipping.',
    icon: '🔊',
    color: '#e8e6e1',
    inputs: ['In'],
    hasOutput: false,
    singleton: true,
    params: [
      { key: 'volume', label: 'Volume', kind: 'number', min: 0, max: 1.2, default: 0.8 },
      { key: 'limiter', label: 'Limiter', kind: 'bool', default: true },
    ],
    inlineParams: ['volume'],
    create: (ctx) => new OutputModule(ctx),
  },
];

const byType = new Map(NODE_DEFINITIONS.map((def) => [def.type, def]));

export function getNodeDefinition(type: string | undefined): NodeDefinition | undefined {
  return type ? byType.get(type) : undefined;
}

export function defaultParams(def: NodeDefinition): Params {
  const params: Params = {};
  for (const spec of def.params) params[spec.key] = spec.default;
  return { ...params, ...def.extraDefaults?.() };
}

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  source: 'Sources',
  effect: 'Effects',
  utility: 'Utility',
  output: 'Output',
};
