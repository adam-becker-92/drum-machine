import type { Edge } from '@xyflow/react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { useTransportStore, type ProjectState } from '../../state/projectStore';
import { getNodeDefinition } from './nodeRegistry';
import { Transport } from './Transport';
import { inputIndexFromHandle, isNoteHandle, type AudioModule, type Clip, type Params } from './types';

interface ModuleEntry {
  module: AudioModule;
  params: Params | null;
  clip: Clip | null;
}

function edgeKey(edge: Edge): string {
  return `${edge.source}->${edge.target}:${edge.targetHandle ?? 'in-0'}`;
}

// Mirrors the project store into live Web Audio: creates/disposes one
// AudioModule per graph node and connects/disconnects them to match the edges.
export class AudioEngine {
  readonly ctx: AudioContext;
  private modules = new Map<string, ModuleEntry>();
  private edges = new Map<string, Edge>();
  private transport: Transport;
  private bpm = 0;
  private unsubscribe: (() => void) | null = null;
  private destroyed = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.transport = new Transport(
      this.ctx,
      (step, time) => {
        for (const { module } of this.modules.values()) module.scheduleStep?.(step, time);
      },
      (step) => useTransportStore.setState({ currentStep: step }),
    );
  }

  bind(store: UseBoundStore<StoreApi<ProjectState>>) {
    this.unsubscribe?.();
    this.sync(store.getState());
    this.unsubscribe = store.subscribe((state) => this.sync(state));
  }

  get isPlaying(): boolean {
    return this.transport.isRunning;
  }

  getModule<T extends AudioModule = AudioModule>(nodeId: string): T | undefined {
    return this.modules.get(nodeId)?.module as T | undefined;
  }

  private sync(state: ProjectState) {
    const liveIds = new Set(state.nodes.map((n) => n.id));

    // 1. Create new modules, push changed params/clips into existing ones.
    for (const node of state.nodes) {
      let entry = this.modules.get(node.id);
      if (!entry) {
        const def = getNodeDefinition(node.type);
        if (!def) continue;
        entry = { module: def.create(this.ctx), params: null, clip: null };
        entry.module.setBpm?.(state.bpm);
        this.modules.set(node.id, entry);
      }
      if (entry.params !== node.data.params) {
        entry.params = node.data.params;
        entry.module.setParams(node.data.params);
      }
      const clip = state.clips[node.id];
      if (clip && entry.clip !== clip) {
        entry.clip = clip;
        entry.module.setClip?.(clip);
      }
    }

    // 2. Disconnect edges that went away (while both ends still exist). Note
    //    (MIDI) cables carry events, not audio, and are routed by midiInput.
    const nextEdges = new Map(state.edges.filter((e) => !isNoteHandle(e.sourceHandle)).map((e) => [edgeKey(e), e]));
    for (const [key, edge] of this.edges) {
      if (!nextEdges.has(key)) {
        this.connect(edge, false);
        this.edges.delete(key);
      }
    }

    // 3. Dispose modules whose node was deleted.
    for (const [id, entry] of this.modules) {
      if (!liveIds.has(id)) {
        entry.module.dispose();
        this.modules.delete(id);
      }
    }

    // 4. Connect new edges.
    for (const [key, edge] of nextEdges) {
      if (!this.edges.has(key) && this.connect(edge, true)) {
        this.edges.set(key, edge);
      }
    }

    if (state.bpm !== this.bpm) {
      this.bpm = state.bpm;
      this.transport.setBpm(state.bpm);
      for (const { module } of this.modules.values()) module.setBpm?.(state.bpm);
    }
  }

  private connect(edge: Edge, on: boolean): boolean {
    const source = this.modules.get(edge.source)?.module.output;
    const target = this.modules.get(edge.target)?.module.inputs[inputIndexFromHandle(edge.targetHandle)];
    if (!source || !target) return false;
    try {
      if (on) source.connect(target);
      else source.disconnect(target);
    } catch {
      // disconnect() throws if the pair was never connected; nothing to undo.
    }
    return true;
  }

  async resume() {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  async play() {
    await this.transport.start();
    useTransportStore.setState({ isPlaying: true });
  }

  stop() {
    this.transport.stop();
    for (const { module } of this.modules.values()) module.onStop?.();
    useTransportStore.setState({ isPlaying: false, currentStep: -1 });
  }

  // Live playing (computer keys, on-screen keyboard, MIDI) goes straight to the module.
  noteOn(nodeId: string, pitch: number, velocity: number) {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.modules.get(nodeId)?.module.noteOn?.(pitch, velocity, this.ctx.currentTime);
  }

  noteOff(nodeId: string, pitch: number) {
    this.modules.get(nodeId)?.module.noteOff?.(pitch, this.ctx.currentTime);
  }

  // Where the playhead is, in fractional steps since play, compensating for
  // output latency so recorded notes land where they were heard.
  playheadPosition(): number | null {
    if (!this.transport.isRunning) return null;
    const latency = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return this.transport.positionAt(this.ctx.currentTime - latency);
  }

  togglePlay() {
    if (this.transport.isRunning) this.stop();
    else void this.play();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stop();
    for (const { module } of this.modules.values()) module.dispose();
    this.modules.clear();
    this.edges.clear();
    void this.ctx.close();
  }
}
