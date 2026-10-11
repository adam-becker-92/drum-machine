import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { findParamSpec } from '../audio/core/nodeRegistry';
import { NOTES_OUT_HANDLE, type MidiMapping, type ParamValue } from '../audio/core/types';
import { num, str } from '../audio/dsp';
import { fromNorm } from '../components/knobMath';
import { liveTarget, pressNote, releaseNote, releaseSource } from './liveInput';
import { useProjectStore } from './projectStore';

// Web MIDI input: notes go through MIDI In nodes' cables (or, with none cabled,
// to the instrument whose tab is open), and controller knobs (CC) drive params
// they've been MIDI-learned to.

export type MidiStatus = 'off' | 'pending' | 'ready' | 'unsupported' | 'denied';

interface MidiState {
  status: MidiStatus;
  inputs: { id: string; name: string }[];
  disabledInputs: string[]; // persisted
  wanted: boolean; // the user switched MIDI on; reconnect on next visit (persisted)
  learning: { nodeId: string; param: string } | null;
  activity: number; // bumps on every message, for the header light
}

export const useMidiStore = create<MidiState>()(
  persist(
    (): MidiState => ({
      status: 'off',
      inputs: [],
      disabledInputs: [],
      wanted: false,
      learning: null,
      activity: 0,
    }),
    {
      name: 'cheeky-synth.midi',
      partialize: (s) => ({ disabledInputs: s.disabledInputs, wanted: s.wanted }),
    },
  ),
);

let access: MIDIAccess | null = null;

function attachInputs() {
  if (!access) return;
  const inputs: MidiState['inputs'] = [];
  for (const input of access.inputs.values()) {
    input.onmidimessage = (e) => e.data && handleMidiMessage(e.data, input.id);
    inputs.push({ id: input.id, name: input.name || 'MIDI device' });
  }
  useMidiStore.setState({ inputs });
}

export async function enableMidi(): Promise<void> {
  if (!('requestMIDIAccess' in navigator)) {
    useMidiStore.setState({ status: 'unsupported' });
    return;
  }
  useMidiStore.setState({ status: 'pending' });
  try {
    access = await navigator.requestMIDIAccess();
    access.onstatechange = attachInputs; // devices plugged in or out
    attachInputs();
    useMidiStore.setState({ status: 'ready', wanted: true });
  } catch {
    useMidiStore.setState({ status: 'denied', wanted: false });
  }
}

export function disableMidi() {
  if (access) {
    for (const input of access.inputs.values()) input.onmidimessage = null;
    access.onstatechange = null;
  }
  access = null;
  releaseSource('midi');
  useMidiStore.setState({ status: 'off', inputs: [], wanted: false, learning: null });
}

export function toggleInput(id: string) {
  const { disabledInputs } = useMidiStore.getState();
  useMidiStore.setState({
    disabledInputs: disabledInputs.includes(id) ? disabledInputs.filter((d) => d !== id) : [...disabledInputs, id],
  });
}

// Where a note on `channel` should go, with the transpose of the MIDI In it came through.
export function midiTargets(channel: number): { target: string; transpose: number }[] {
  const { nodes, edges } = useProjectStore.getState();
  const cabled = nodes
    .filter((n) => n.type === 'midiIn')
    .flatMap((midiIn) =>
      edges
        .filter((e) => e.source === midiIn.id && e.sourceHandle === NOTES_OUT_HANDLE)
        .map((e) => ({ midiIn, target: e.target })),
    );
  if (cabled.length === 0) {
    const target = liveTarget();
    return target ? [{ target, transpose: 0 }] : [];
  }
  return cabled
    .filter(({ midiIn }) => {
      const ch = str(midiIn.data.params.channel, 'omni');
      return ch === 'omni' || Number(ch) === channel + 1;
    })
    .map(({ midiIn, target }) => ({ target, transpose: Math.round(num(midiIn.data.params.transpose, 0)) }));
}

// Notes currently held from MIDI: "channel:pitch" -> where each went.
const midiHeld = new Map<string, { target: string; pitch: number }[]>();

function noteOn(channel: number, pitch: number, velocity: number) {
  noteOff(channel, pitch); // a repeated note-on without a note-off: retrigger cleanly
  const routed = midiTargets(channel).map(({ target, transpose }) => ({
    target,
    pitch: Math.min(127, Math.max(0, pitch + transpose)),
  }));
  for (const { target, pitch: p } of routed) pressNote(p, velocity, target, 'midi');
  midiHeld.set(`${channel}:${pitch}`, routed);
}

function noteOff(channel: number, pitch: number) {
  const key = `${channel}:${pitch}`;
  for (const { target, pitch: p } of midiHeld.get(key) ?? []) releaseNote(p, target, 'midi');
  midiHeld.delete(key);
}

// Maps a 0..127 controller value onto a param, respecting its range and curve.
export function ccToParamValue(nodeType: string | undefined, param: string, value: number): ParamValue | undefined {
  const spec = findParamSpec(nodeType, param);
  if (!spec) return undefined;
  const t = value / 127;
  if (spec.kind === 'bool') return value >= 64;
  if (spec.kind === 'select') return spec.options[Math.min(spec.options.length - 1, Math.floor(t * spec.options.length))].value;
  const v = fromNorm(t, spec.min, spec.max, spec.scale === 'log' && spec.min > 0);
  return spec.step ? Math.round(v / spec.step) * spec.step : v;
}

function applyMapping(mapping: MidiMapping, value: number) {
  const { nodes, updateParams } = useProjectStore.getState();
  const node = nodes.find((n) => n.id === mapping.nodeId);
  const v = ccToParamValue(node?.type, mapping.param, value);
  if (node && v !== undefined) updateParams(node.id, { [mapping.param]: v });
}

function controlChange(channel: number, cc: number, value: number) {
  const { learning } = useMidiStore.getState();
  if (learning) {
    const mapping = { channel, cc, ...learning };
    useProjectStore.getState().setMidiMapping(mapping);
    useMidiStore.setState({ learning: null });
    applyMapping(mapping, value);
    return;
  }
  for (const m of useProjectStore.getState().midiMappings) {
    if (m.channel === channel && m.cc === cc) applyMapping(m, value);
  }
}

export function handleMidiMessage(data: ArrayLike<number>, inputId?: string) {
  const [status, d1 = 0, d2 = 0] = Array.from(data);
  // System messages (clock, active sensing) arrive constantly; ignore them.
  if (status === undefined || status >= 0xf0) return;
  if (inputId && useMidiStore.getState().disabledInputs.includes(inputId)) return;
  useMidiStore.setState((s) => ({ activity: s.activity + 1 }));
  const type = status & 0xf0;
  const channel = status & 0x0f;
  if (type === 0x90 && d2 > 0) noteOn(channel, d1, d2 / 127);
  else if (type === 0x80 || type === 0x90) noteOff(channel, d1);
  else if (type === 0xb0) controlChange(channel, d1, d2);
}

export function startLearning(nodeId: string, param: string) {
  if (useMidiStore.getState().status !== 'ready') void enableMidi();
  useMidiStore.setState({ learning: { nodeId, param } });
}

export function cancelLearning() {
  useMidiStore.setState({ learning: null });
}
