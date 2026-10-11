import { noteClip } from '../clips';
import { BassSynthModule } from '../modules/bassSynth';
import { FmSynthModule } from '../modules/fmSynth';
import { PolySynthModule } from '../modules/polySynth';
import { SamplerModule } from '../modules/sampler';
import { BUILT_IN_SAMPLES } from '../sampleLibrary';
import type { NodeDefinition, NumberParamSpec, ParamSpec } from './types';

const WAVES = [
  { value: 'sawtooth', label: 'Saw' },
  { value: 'square', label: 'Sq' },
  { value: 'triangle', label: 'Tri' },
  { value: 'sine', label: 'Sine' },
];

// Shorthand for time knobs, which want a log feel.
function time(key: string, label: string, group: string, min: number, max: number, def: number): NumberParamSpec {
  return { key, label, group, kind: 'number', min, max, default: def, unit: 's', scale: 'log' };
}

function level(key: string, label: string, group: string, def: number, max = 1): NumberParamSpec {
  return { key, label, group, kind: 'number', min: 0, max, default: def };
}

function adsr(prefix: string, group: string, d: [number, number, number, number]): ParamSpec[] {
  const key = (name: string) => (prefix ? `${prefix}${name}` : name.charAt(0).toLowerCase() + name.slice(1));
  return [
    time(key('Attack'), 'Attack', group, 0.001, 4, d[0]),
    time(key('Decay'), 'Decay', group, 0.01, 6, d[1]),
    level(key('Sustain'), 'Sustain', group, d[2]),
    time(key('Release'), 'Release', group, 0.01, 8, d[3]),
  ];
}

const volume: NumberParamSpec = { key: 'volume', label: 'Volume', group: 'Output', kind: 'number', min: 0, max: 1.5, default: 0.8 };

export const INSTRUMENT_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'polySynth',
    label: 'Poly Synth',
    category: 'source',
    description: 'Juno/Prophet-style 8-voice analog poly: two oscillators, noise, resonant filter with its own envelope, LFO.',
    icon: '🎹',
    color: '#ef6fa8',
    inputs: [],
    hasOutput: true,
    playable: true,
    params: [
      { key: 'osc1Wave', label: 'Osc 1', group: 'Oscillators', kind: 'select', options: WAVES, default: 'sawtooth' },
      { key: 'osc2Wave', label: 'Osc 2', group: 'Oscillators', kind: 'select', options: WAVES, default: 'sawtooth' },
      { key: 'osc2Semi', label: 'Osc 2 Semi', group: 'Oscillators', kind: 'number', min: -24, max: 24, step: 1, default: 0, unit: 'st' },
      { key: 'osc2Fine', label: 'Osc 2 Fine', group: 'Oscillators', kind: 'number', min: -50, max: 50, default: 7, unit: 'ct' },
      level('oscMix', 'Mix 1/2', 'Oscillators', 0.5),
      level('noise', 'Noise', 'Oscillators', 0),
      { key: 'cutoff', label: 'Cutoff', group: 'Filter', kind: 'number', min: 40, max: 18000, default: 1800, unit: 'Hz', scale: 'log' },
      { key: 'resonance', label: 'Res', group: 'Filter', kind: 'number', min: 0.1, max: 20, default: 2, scale: 'log' },
      level('envAmount', 'Env Amt', 'Filter', 0.4),
      ...adsr('f', 'Filter Envelope', [0.01, 0.6, 0.2, 0.5]),
      ...adsr('', 'Amp Envelope', [0.01, 0.4, 0.7, 0.5]),
      {
        key: 'lfoTarget',
        label: 'LFO To',
        group: 'LFO',
        kind: 'select',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'pitch', label: 'Pitch' },
          { value: 'cutoff', label: 'Cutoff' },
        ],
        default: 'off',
      },
      { key: 'lfoRate', label: 'Rate', group: 'LFO', kind: 'number', min: 0.05, max: 20, default: 5, unit: 'Hz', scale: 'log' },
      level('lfoDepth', 'Depth', 'LFO', 0.3),
      volume,
    ],
    inlineParams: ['cutoff', 'volume'],
    presets: [
      { name: 'Init Saw', params: {} },
      {
        name: 'Juno Pad',
        params: { osc2Fine: 9, cutoff: 1400, resonance: 1.5, envAmount: 0.2, attack: 0.6, decay: 1, sustain: 0.8, release: 1.6, lfoTarget: 'cutoff', lfoRate: 0.4, lfoDepth: 0.35 },
      },
      {
        name: 'Brass',
        params: { cutoff: 700, resonance: 1.2, envAmount: 0.65, fAttack: 0.08, fDecay: 0.5, fSustain: 0.4, attack: 0.04, decay: 0.3, sustain: 0.85, release: 0.25 },
      },
      {
        name: 'Stab',
        params: { osc2Wave: 'square', osc2Semi: 12, cutoff: 500, resonance: 4, envAmount: 0.8, fDecay: 0.22, fSustain: 0, attack: 0.002, decay: 0.3, sustain: 0, release: 0.2 },
      },
      {
        name: 'Lead',
        params: { osc2Wave: 'square', osc2Semi: 7, osc2Fine: 3, oscMix: 0.35, cutoff: 3200, resonance: 4, envAmount: 0.3, lfoTarget: 'pitch', lfoRate: 5.5, lfoDepth: 0.25, release: 0.25 },
      },
      {
        name: 'Strings',
        params: { osc2Fine: 14, noise: 0.05, cutoff: 3800, resonance: 0.8, envAmount: 0.1, attack: 0.35, sustain: 0.9, release: 1.1, lfoTarget: 'pitch', lfoRate: 5, lfoDepth: 0.08 },
      },
    ],
    // Am – F – C – G, one bar each.
    createClip: () =>
      noteClip(64, [
        [0, 57, 14, 0.7], [0, 60, 14, 0.7], [0, 64, 14, 0.7],
        [16, 53, 14, 0.7], [16, 57, 14, 0.7], [16, 60, 14, 0.7],
        [32, 55, 14, 0.7], [32, 60, 14, 0.7], [32, 64, 14, 0.7],
        [48, 55, 14, 0.7], [48, 59, 14, 0.7], [48, 62, 14, 0.7],
      ]),
    create: (ctx) => new PolySynthModule(ctx),
  },
  {
    type: 'bassSynth',
    label: 'Bass Synth',
    category: 'source',
    description: 'TB-303-style acid bass: mono, 24 dB resonant filter, env mod and decay. Loud notes accent, overlapping notes slide.',
    icon: '🎸',
    color: '#8bd450',
    inputs: [],
    hasOutput: true,
    playable: true,
    params: [
      {
        key: 'wave',
        label: 'Wave',
        group: 'Tone',
        kind: 'select',
        options: [
          { value: 'sawtooth', label: 'Saw' },
          { value: 'square', label: 'Square' },
        ],
        default: 'sawtooth',
      },
      { key: 'tune', label: 'Tune', group: 'Tone', kind: 'number', min: -12, max: 12, step: 1, default: 0, unit: 'st' },
      { key: 'cutoff', label: 'Cutoff', group: 'Filter', kind: 'number', min: 40, max: 6000, default: 380, unit: 'Hz', scale: 'log' },
      { key: 'resonance', label: 'Res', group: 'Filter', kind: 'number', min: 0.5, max: 30, default: 12, scale: 'log' },
      level('envMod', 'Env Mod', 'Filter', 0.6),
      time('decay', 'Decay', 'Filter', 0.05, 2, 0.35),
      level('accent', 'Accent', 'Performance', 0.6),
      time('slide', 'Slide', 'Performance', 0.01, 0.4, 0.06),
      volume,
    ],
    inlineParams: ['cutoff', 'resonance'],
    presets: [
      { name: 'Acid Classic', params: {} },
      { name: 'Squelch', params: { cutoff: 240, resonance: 22, envMod: 0.85, decay: 0.25, accent: 0.8 } },
      { name: 'Sub Bass', params: { wave: 'square', cutoff: 160, resonance: 0.8, envMod: 0.1, decay: 0.8, accent: 0.2 } },
      { name: 'Rubber', params: { wave: 'square', cutoff: 480, resonance: 7, envMod: 0.45, decay: 0.55 } },
    ],
    // A minor acid line; the note at step 6 overlaps the next one, so it slides.
    createClip: () =>
      noteClip(16, [
        [0, 45, 1, 0.9], [2, 45, 1, 0.6], [3, 57, 1, 0.6], [4, 45, 1, 0.6],
        [6, 48, 2, 0.6], [7, 52, 1, 0.9], [8, 45, 1, 0.6], [10, 43, 1, 0.6],
        [11, 45, 1, 0.9], [12, 48, 1, 0.6], [14, 50, 1, 0.6], [15, 52, 1, 0.6],
      ]),
    create: (ctx) => new BassSynthModule(ctx),
  },
  {
    type: 'fmSynth',
    label: 'FM Synth',
    category: 'source',
    description: 'DX7-style 2-operator FM: bells, electric pianos, plucks and brass.',
    icon: '🔔',
    color: '#4dd0e1',
    inputs: [],
    hasOutput: true,
    playable: true,
    params: [
      { key: 'ratio', label: 'Ratio', group: 'Operator', kind: 'number', min: 0.5, max: 14, step: 0.5, default: 1 },
      { key: 'index', label: 'Index', group: 'Operator', kind: 'number', min: 0, max: 12, default: 3 },
      { key: 'detune', label: 'Detune', group: 'Operator', kind: 'number', min: -50, max: 50, default: 0, unit: 'ct' },
      ...adsr('mod', 'Modulator Envelope', [0.005, 0.8, 0.25, 0.5]),
      ...adsr('', 'Amp Envelope', [0.005, 1.2, 0.4, 0.6]),
      volume,
    ],
    inlineParams: ['ratio', 'index'],
    presets: [
      { name: 'E.Piano', params: { ratio: 1, index: 2.2, modDecay: 1.2, modSustain: 0.15, attack: 0.002, decay: 1.8, sustain: 0.25, release: 0.6 } },
      { name: 'Bell', params: { ratio: 3.5, index: 5, modDecay: 2.5, modSustain: 0.1, modRelease: 2, attack: 0.002, decay: 3.5, sustain: 0, release: 2.5 } },
      { name: 'Pluck', params: { ratio: 1, index: 4, modDecay: 0.15, modSustain: 0, attack: 0.002, decay: 0.4, sustain: 0, release: 0.2 } },
      { name: 'Brass', params: { ratio: 1, index: 3, modAttack: 0.06, modDecay: 0.4, modSustain: 0.7, attack: 0.04, decay: 0.3, sustain: 0.8, release: 0.25 } },
      { name: 'Glass', params: { ratio: 7, index: 1.6, modDecay: 1.5, modSustain: 0.2, attack: 0.01, decay: 2.5, sustain: 0.2, release: 1.5 } },
    ],
    // A-minor arpeggio.
    createClip: () =>
      noteClip(16, [
        [0, 69, 2, 0.8], [2, 72, 2, 0.6], [4, 76, 2, 0.7], [6, 72, 2, 0.6],
        [8, 69, 2, 0.8], [10, 72, 2, 0.6], [12, 76, 2, 0.7], [14, 79, 2, 0.6],
      ]),
    create: (ctx) => new FmSynthModule(ctx),
  },
  {
    type: 'sampler',
    label: 'Sampler',
    category: 'source',
    description: 'Plays any audio file pitched across the keys. Drop in a WAV/MP3, or start from a built-in sound.',
    icon: '💿',
    color: '#ff8f5a',
    inputs: [],
    hasOutput: true,
    playable: true,
    params: [
      { key: 'root', label: 'Root', group: 'Sample', kind: 'number', min: 24, max: 96, step: 1, default: BUILT_IN_SAMPLES[0].root, unit: 'note' },
      { key: 'start', label: 'Start', group: 'Sample', kind: 'number', min: 0, max: 0.95, default: 0 },
      { key: 'loop', label: 'Loop', group: 'Sample', kind: 'bool', default: false },
      { key: 'tune', label: 'Tune', group: 'Pitch', kind: 'number', min: -24, max: 24, step: 1, default: 0, unit: 'st' },
      { key: 'fine', label: 'Fine', group: 'Pitch', kind: 'number', min: -50, max: 50, default: 0, unit: 'ct' },
      ...adsr('', 'Amp Envelope', [0.003, 0.5, 1, 0.3]),
      { key: 'cutoff', label: 'Cutoff', group: 'Filter', kind: 'number', min: 40, max: 18000, default: 18000, unit: 'Hz', scale: 'log' },
      { key: 'resonance', label: 'Res', group: 'Filter', kind: 'number', min: 0.1, max: 20, default: 0.7, scale: 'log' },
      volume,
    ],
    inlineParams: ['cutoff', 'volume'],
    // The chosen sample is picked in the editor rather than with a knob.
    extraDefaults: () => ({ sampleId: BUILT_IN_SAMPLES[0].id, sampleName: BUILT_IN_SAMPLES[0].name }),
    presets: [
      { name: 'Pluck', params: { sampleId: BUILT_IN_SAMPLES[0].id, sampleName: 'Pluck', root: 48 } },
      { name: 'Keys', params: { sampleId: BUILT_IN_SAMPLES[1].id, sampleName: 'Keys', root: 60, release: 0.6 } },
      {
        name: 'Pad',
        params: { sampleId: BUILT_IN_SAMPLES[2].id, sampleName: 'Pad', root: 60, loop: true, start: 0.3, attack: 0.4, release: 1.4, cutoff: 5000 },
      },
    ],
    createClip: () =>
      noteClip(16, [
        [0, 57, 2, 0.8], [3, 60, 2, 0.6], [6, 64, 2, 0.7], [8, 62, 2, 0.7],
        [11, 60, 2, 0.6], [14, 59, 2, 0.6],
      ]),
    create: (ctx) => new SamplerModule(ctx),
  },
];
