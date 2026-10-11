import type { Edge, Viewport } from '@xyflow/react';
import { CLIP_LENGTHS, normalizeNotes } from '../audio/clips';
import { defaultParams, getNodeDefinition } from '../audio/core/nodeRegistry';
import type { Clip, MidiMapping, Note, Params } from '../audio/core/types';
import { STEP_COUNT, TRACKS } from '../audio/tracks';
import { GRAPH_TAB, MAX_BPM, MIN_BPM, type ProjectData, type SynthNode } from '../state/projectStore';

export const FILE_APP = 'cheeky-synth';
const FILE_VERSION = 1;

type Loose = Record<string, unknown>;

const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

// Just the data that describes the project (no React Flow runtime fields like
// `measured` or `selected`), for files and share links.
export function compactProject(data: ProjectData, { keepView = true } = {}): ProjectData {
  return {
    nodes: data.nodes.map(({ id, type, position, data: d }) => ({ id, type, position, data: d })),
    edges: data.edges.map(({ id, source, sourceHandle, target, targetHandle }) => ({
      id,
      source,
      sourceHandle,
      target,
      targetHandle,
    })),
    clips: data.clips,
    bpm: data.bpm,
    openTabs: keepView ? data.openTabs : [],
    activeTab: keepView ? data.activeTab : GRAPH_TAB,
    viewport: keepView ? data.viewport : null,
    midiMappings: data.midiMappings,
  };
}

export function serializeProject(data: ProjectData): string {
  return JSON.stringify({ app: FILE_APP, version: FILE_VERSION, savedAt: new Date().toISOString(), project: compactProject(data) });
}

function parseClip(raw: unknown, fallback: Clip): Clip {
  if (!isObject(raw) || raw.kind !== fallback.kind) return fallback;
  if (raw.kind === 'notes') {
    const length = CLIP_LENGTHS.includes(raw.length as number) ? (raw.length as number) : 16;
    const notes = (Array.isArray(raw.notes) ? raw.notes : [])
      .filter((n): n is Loose => isObject(n) && isNum(n.pitch) && isNum(n.start) && isNum(n.length))
      .map((n, i) => ({
        id: isStr(n.id) ? n.id : `n${i}`,
        pitch: n.pitch as number,
        start: n.start as number,
        length: n.length as number,
        velocity: isNum(n.velocity) ? n.velocity : 0.8,
      })) satisfies Note[];
    return { kind: 'notes', length, notes: normalizeNotes(notes, length) };
  }
  const pattern: Record<string, boolean[]> = {};
  const source = isObject(raw.pattern) ? raw.pattern : {};
  for (const { id } of TRACKS) {
    const steps = Array.isArray(source[id]) ? (source[id] as unknown[]) : [];
    pattern[id] = Array.from({ length: STEP_COUNT }, (_, i) => steps[i] === true);
  }
  return { kind: 'drum', pattern };
}

// Validates and repairs a project from a file or share link: unknown node types,
// dangling cables and malformed clips are dropped, missing params get defaults.
// Returns null if it doesn't look like a project at all.
export function parseProject(input: unknown): ProjectData | null {
  const raw = isObject(input) && input.app === FILE_APP && isObject(input.project) ? input.project : input;
  if (!isObject(raw) || !Array.isArray(raw.nodes)) return null;

  const nodes: SynthNode[] = [];
  const seen = new Set<string>();
  for (const n of raw.nodes) {
    if (!isObject(n) || !isStr(n.id) || !isStr(n.type) || seen.has(n.id)) continue;
    const def = getNodeDefinition(n.type);
    if (!def) continue;
    if (def.singleton && nodes.some((existing) => existing.type === n.type)) continue;
    const position = isObject(n.position) && isNum(n.position.x) && isNum(n.position.y) ? { x: n.position.x, y: n.position.y } : { x: 0, y: 0 };
    const data = isObject(n.data) ? n.data : {};
    const params = isObject(data.params) ? (data.params as Params) : {};
    nodes.push({
      id: n.id,
      type: n.type,
      position,
      data: { name: isStr(data.name) ? data.name : def.label, params: { ...defaultParams(def), ...params } },
    });
    seen.add(n.id);
  }
  if (nodes.length === 0) return null;

  const edges: Edge[] = [];
  for (const e of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!isObject(e) || !isStr(e.source) || !isStr(e.target) || !seen.has(e.source) || !seen.has(e.target)) continue;
    const sourceHandle = isStr(e.sourceHandle) ? e.sourceHandle : 'out';
    const targetHandle = isStr(e.targetHandle) ? e.targetHandle : 'in-0';
    const id = isStr(e.id) ? e.id : `e-${e.source}-${sourceHandle}-${e.target}-${targetHandle}`;
    if (edges.some((existing) => existing.id === id)) continue;
    edges.push({ id, source: e.source, sourceHandle, target: e.target, targetHandle });
  }

  const rawClips = isObject(raw.clips) ? raw.clips : {};
  const clips: Record<string, Clip> = {};
  for (const node of nodes) {
    const fresh = getNodeDefinition(node.type)?.createClip?.();
    if (fresh) clips[node.id] = parseClip(rawClips[node.id], fresh);
  }

  const midiMappings = (Array.isArray(raw.midiMappings) ? raw.midiMappings : []).filter(
    (m): m is MidiMapping =>
      isObject(m) && isNum(m.channel) && isNum(m.cc) && isStr(m.nodeId) && isStr(m.param) && seen.has(m.nodeId),
  );

  const openTabs = (Array.isArray(raw.openTabs) ? raw.openTabs : []).filter((t): t is string => isStr(t) && seen.has(t));
  const activeTab = isStr(raw.activeTab) && openTabs.includes(raw.activeTab) ? raw.activeTab : GRAPH_TAB;
  const v = raw.viewport;
  const viewport: Viewport | null = isObject(v) && isNum(v.x) && isNum(v.y) && isNum(v.zoom) ? { x: v.x, y: v.y, zoom: v.zoom } : null;
  const bpm = isNum(raw.bpm) ? Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(raw.bpm))) : 120;

  return { nodes, edges, clips, bpm, openTabs, activeTab, viewport, midiMappings };
}
