import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CLIP_LENGTHS, newNoteId, normalizeNotes } from '../audio/clips';
import { defaultParams, getNodeDefinition } from '../audio/core/nodeRegistry';
import {
  OUTPUT_HANDLE,
  inputHandleId,
  type Clip,
  type MidiMapping,
  type Note,
  type ParamValue,
  type Params,
} from '../audio/core/types';
import { STEP_COUNT } from '../audio/tracks';

export type SynthNodeData = { name: string; params: Params };
export type SynthNode = Node<SynthNodeData>;

export const GRAPH_TAB = 'graph';
export const MIN_BPM = 40;
export const MAX_BPM = 240;
const PROJECT_VERSION = 1;

// `?project=name` keeps a separately saved project (handy for a scratch copy in another tab).
const projectName = new URLSearchParams(window.location.search).get('project');
const STORAGE_KEY = projectName ? `cheeky-synth.project.${projectName}` : 'cheeky-synth.project';

export interface ProjectData {
  nodes: SynthNode[];
  edges: Edge[];
  clips: Record<string, Clip>;
  bpm: number;
  openTabs: string[];
  activeTab: string;
  viewport: Viewport | null;
  midiMappings: MidiMapping[];
}

interface ProjectActions {
  onNodesChange: (changes: NodeChange<SynthNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  // Moves one end of an existing cable; refused (cable kept) if it would form a loop.
  reconnectEdge: (oldEdge: Edge, connection: Connection) => void;
  removeEdge: (edgeId: string) => void;
  // Splices an unconnected node into an existing cable: A -> B becomes A -> node -> B.
  insertNodeOnEdge: (nodeId: string, edgeId: string) => boolean;
  addNode: (type: string, position: { x: number; y: number }) => string | null;
  updateParams: (nodeId: string, patch: Record<string, ParamValue>) => void;
  renameNode: (nodeId: string, name: string) => void;
  toggleDrumStep: (nodeId: string, trackId: string, step: number) => void;
  setDrumStep: (nodeId: string, trackId: string, step: number, on: boolean) => void;
  // Replaces a note clip's notes (normalised to fit the clip).
  setNotes: (nodeId: string, notes: Note[]) => void;
  setClipLength: (nodeId: string, length: number) => void;
  // Swaps in a whole clip (library, .mid import, shared link) if it suits the node.
  replaceClip: (nodeId: string, clip: Clip) => boolean;
  setMidiMapping: (mapping: MidiMapping) => void;
  removeMidiMapping: (nodeId: string, param: string) => void;
  clearClip: (nodeId: string) => void;
  clearAllClips: () => void;
  setBpm: (bpm: number) => void;
  openTab: (nodeId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setViewport: (viewport: Viewport) => void;
  resetProject: () => void;
  loadProject: (data: ProjectData) => void;
}

export type ProjectState = ProjectData & ProjectActions;

function newId(type: string): string {
  return `${type}-${crypto.randomUUID().slice(0, 8)}`;
}

function makeNode(type: string, position: { x: number; y: number }, name?: string): SynthNode | null {
  const def = getNodeDefinition(type);
  if (!def) return null;
  return { id: newId(type), type, position, data: { name: name ?? def.label, params: defaultParams(def) } };
}

function makeEdge(source: string, target: string, inputIndex = 0): Edge {
  return {
    id: `e-${source}-${target}-${inputIndex}`,
    source,
    sourceHandle: OUTPUT_HANDLE,
    target,
    targetHandle: inputHandleId(inputIndex),
  };
}

function createDefaultProject(): ProjectData {
  const drums = makeNode('drumMachine', { x: 0, y: 60 })!;
  const reverb = makeNode('reverb', { x: 320, y: 60 })!;
  reverb.data.params.mix = 0.15;
  const output = makeNode('master', { x: 600, y: 80 })!;
  return {
    nodes: [drums, reverb, output],
    edges: [makeEdge(drums.id, reverb.id), makeEdge(reverb.id, output.id)],
    clips: { [drums.id]: getNodeDefinition('drumMachine')!.createClip!() },
    bpm: 120,
    openTabs: [],
    activeTab: GRAPH_TAB,
    viewport: null,
    midiMappings: [],
  };
}

// Web Audio graphs without a DelayNode in the loop go silent, so refuse cycles.
export function wouldCreateCycle(edges: Edge[], source: string, target: string): boolean {
  if (source === target) return true;
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) {
      if (edge.source === current) stack.push(edge.target);
    }
  }
  return false;
}

function uniqueName(nodes: SynthNode[], base: string): string {
  const taken = new Set(nodes.map((n) => n.data.name));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

function emptyClip(clip: Clip): Clip {
  if (clip.kind === 'notes') return { ...clip, notes: [] };
  const pattern: Record<string, boolean[]> = {};
  for (const id of Object.keys(clip.pattern)) pattern[id] = new Array(STEP_COUNT).fill(false);
  return { ...clip, pattern };
}

// The saved/undoable part of the state (everything except the actions).
export function pickProjectData(state: ProjectData): ProjectData {
  return {
    nodes: state.nodes.map(({ dragging: _dragging, ...n }) => n),
    edges: state.edges,
    clips: state.clips,
    bpm: state.bpm,
    openTabs: state.openTabs,
    activeTab: state.activeTab,
    viewport: state.viewport,
    midiMappings: state.midiMappings,
  };
}

// Deep copy with fresh note ids, so one clip can be loaded into several nodes.
function cloneClip(clip: Clip): Clip {
  if (clip.kind === 'notes') {
    return { ...clip, notes: normalizeNotes(clip.notes.map((n) => ({ ...n, id: newNoteId() })), clip.length) };
  }
  const pattern: Record<string, boolean[]> = {};
  for (const [track, steps] of Object.entries(clip.pattern)) {
    pattern[track] = Array.from({ length: STEP_COUNT }, (_, i) => steps[i] === true);
  }
  return { kind: 'drum', pattern };
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      ...createDefaultProject(),

      onNodesChange: (changes) => {
        const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
        set((state) => {
          const nodes = applyNodeChanges(changes, state.nodes);
          if (removed.size === 0) return { nodes };
          const clips = { ...state.clips };
          for (const id of removed) delete clips[id];
          const openTabs = state.openTabs.filter((t) => !removed.has(t));
          return {
            nodes,
            clips,
            openTabs,
            edges: state.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
            activeTab: removed.has(state.activeTab) ? GRAPH_TAB : state.activeTab,
            midiMappings: state.midiMappings.filter((m) => !removed.has(m.nodeId)),
          };
        });
      },

      onEdgesChange: (changes) => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

      onConnect: (connection) => {
        const { edges } = get();
        if (wouldCreateCycle(edges, connection.source, connection.target)) return;
        set({ edges: addEdge(connection, edges) });
      },

      reconnectEdge: (oldEdge, connection) => {
        const others = get().edges.filter((e) => e.id !== oldEdge.id);
        if (wouldCreateCycle(others, connection.source, connection.target)) return;
        set({ edges: addEdge(connection, others) });
      },

      removeEdge: (edgeId) => set((state) => ({ edges: state.edges.filter((e) => e.id !== edgeId) })),

      insertNodeOnEdge: (nodeId, edgeId) => {
        const { nodes, edges } = get();
        const node = nodes.find((n) => n.id === nodeId);
        const def = getNodeDefinition(node?.type);
        const edge = edges.find((e) => e.id === edgeId);
        if (!def || !def.inputs.length || !def.hasOutput || !edge) return false;
        if (edges.some((e) => e.source === nodeId || e.target === nodeId)) return false;
        let next = edges.filter((e) => e.id !== edgeId);
        next = addEdge(
          { source: edge.source, sourceHandle: edge.sourceHandle ?? OUTPUT_HANDLE, target: nodeId, targetHandle: inputHandleId(0) },
          next,
        );
        next = addEdge(
          { source: nodeId, sourceHandle: OUTPUT_HANDLE, target: edge.target, targetHandle: edge.targetHandle ?? inputHandleId(0) },
          next,
        );
        set({ edges: next });
        return true;
      },

      addNode: (type, position) => {
        const def = getNodeDefinition(type);
        if (!def) return null;
        const { nodes, clips } = get();
        if (def.singleton) {
          const existing = nodes.find((n) => n.type === type);
          if (existing) return existing.id;
        }
        const node = makeNode(type, position, uniqueName(nodes, def.label));
        if (!node) return null;
        set({
          nodes: [...nodes, node],
          clips: def.createClip ? { ...clips, [node.id]: def.createClip() } : clips,
        });
        return node.id;
      },

      updateParams: (nodeId, patch) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, ...patch } } } : n,
          ),
        })),

      renameNode: (nodeId, name) =>
        set((state) => ({
          nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, name } } : n)),
        })),

      toggleDrumStep: (nodeId, trackId, step) =>
        set((state) => {
          const clip = state.clips[nodeId];
          if (clip?.kind !== 'drum') return {};
          const track = [...(clip.pattern[trackId] ?? new Array(STEP_COUNT).fill(false))];
          track[step] = !track[step];
          return { clips: { ...state.clips, [nodeId]: { ...clip, pattern: { ...clip.pattern, [trackId]: track } } } };
        }),

      setDrumStep: (nodeId, trackId, step, on) =>
        set((state) => {
          const clip = state.clips[nodeId];
          if (clip?.kind !== 'drum' || step < 0 || step >= STEP_COUNT) return {};
          const track = [...(clip.pattern[trackId] ?? new Array(STEP_COUNT).fill(false))];
          if (track[step] === on) return {};
          track[step] = on;
          return { clips: { ...state.clips, [nodeId]: { ...clip, pattern: { ...clip.pattern, [trackId]: track } } } };
        }),

      replaceClip: (nodeId, clip) => {
        const current = get().clips[nodeId];
        if (!current || current.kind !== clip.kind) return false;
        set((state) => ({ clips: { ...state.clips, [nodeId]: cloneClip(clip) } }));
        return true;
      },

      setMidiMapping: (mapping) =>
        set((state) => ({
          // One param per controller knob, and one controller knob per param.
          midiMappings: [
            ...state.midiMappings.filter(
              (m) =>
                !(m.channel === mapping.channel && m.cc === mapping.cc) &&
                !(m.nodeId === mapping.nodeId && m.param === mapping.param),
            ),
            mapping,
          ],
        })),

      removeMidiMapping: (nodeId, param) =>
        set((state) => ({
          midiMappings: state.midiMappings.filter((m) => !(m.nodeId === nodeId && m.param === param)),
        })),

      setNotes: (nodeId, notes) =>
        set((state) => {
          const clip = state.clips[nodeId];
          if (clip?.kind !== 'notes') return {};
          return { clips: { ...state.clips, [nodeId]: { ...clip, notes: normalizeNotes(notes, clip.length) } } };
        }),

      setClipLength: (nodeId, length) =>
        set((state) => {
          const clip = state.clips[nodeId];
          if (clip?.kind !== 'notes' || !CLIP_LENGTHS.includes(length)) return {};
          return { clips: { ...state.clips, [nodeId]: { ...clip, length, notes: normalizeNotes(clip.notes, length) } } };
        }),

      clearClip: (nodeId) =>
        set((state) => {
          const clip = state.clips[nodeId];
          return clip ? { clips: { ...state.clips, [nodeId]: emptyClip(clip) } } : {};
        }),

      clearAllClips: () =>
        set((state) => ({
          clips: Object.fromEntries(Object.entries(state.clips).map(([id, clip]) => [id, emptyClip(clip)])),
        })),

      setBpm: (bpm) => set({ bpm: Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm) || MIN_BPM)) }),

      openTab: (nodeId) =>
        set((state) => ({
          openTabs: state.openTabs.includes(nodeId) ? state.openTabs : [...state.openTabs, nodeId],
          activeTab: nodeId,
        })),

      closeTab: (tabId) =>
        set((state) => {
          const index = state.openTabs.indexOf(tabId);
          const openTabs = state.openTabs.filter((t) => t !== tabId);
          const activeTab =
            state.activeTab === tabId ? (openTabs[Math.min(index, openTabs.length - 1)] ?? GRAPH_TAB) : state.activeTab;
          return { openTabs, activeTab };
        }),

      setActiveTab: (tabId) => set({ activeTab: tabId }),

      setViewport: (viewport) => set({ viewport }),

      resetProject: () => set(createDefaultProject()),

      loadProject: (data) => set(data),
    }),
    {
      name: STORAGE_KEY,
      version: PROJECT_VERSION,
      partialize: (state) => pickProjectData(state),
      // Fill in params added to a node type after the project was saved.
      merge: (persisted, current) => {
        const saved = persisted as Partial<ProjectData> | undefined;
        if (!saved?.nodes) return current;
        const nodes = saved.nodes
          .filter((n) => getNodeDefinition(n.type))
          .map((n) => ({
            ...n,
            data: { ...n.data, params: { ...defaultParams(getNodeDefinition(n.type)!), ...n.data.params } },
          }));
        return { ...current, ...saved, nodes };
      },
    },
  ),
);

interface TransportState {
  isPlaying: boolean;
  currentStep: number;
}

// Fast-changing playback state, kept out of the persisted project store.
export const useTransportStore = create<TransportState>(() => ({ isPlaying: false, currentStep: -1 }));
