import { getNodeDefinition } from '../audio/core/nodeRegistry';
import { inputIndexFromHandle, isNoteHandle, type AudioModule } from '../audio/core/types';
import type { ProjectData } from '../state/projectStore';

const LEAD_IN = 0.05; // lets the initial parameter smoothing settle
const TAIL = 2.5; // room for reverb and delay tails

export function renderSeconds(project: Pick<ProjectData, 'bpm'>, bars: number): number {
  return bars * 16 * (60 / project.bpm / 4) + LEAD_IN + TAIL;
}

// Builds the same graph you hear on an OfflineAudioContext and renders `bars`
// bars of it, faster than real time. Sequencing is scheduled up front.
export async function renderProject(project: ProjectData, bars: number, sampleRate: number): Promise<AudioBuffer> {
  const stepTime = 60 / project.bpm / 4;
  const steps = bars * 16;
  const ctx = new OfflineAudioContext(2, Math.ceil(renderSeconds(project, bars) * sampleRate), sampleRate);

  const modules = new Map<string, AudioModule>();
  for (const node of project.nodes) {
    const def = getNodeDefinition(node.type);
    if (!def) continue;
    const module = def.create(ctx);
    module.setBpm?.(project.bpm);
    module.setParams(node.data.params);
    const clip = project.clips[node.id];
    if (clip) module.setClip?.(clip);
    modules.set(node.id, module);
  }
  for (const edge of project.edges) {
    if (isNoteHandle(edge.sourceHandle)) continue;
    const source = modules.get(edge.source)?.output;
    const target = modules.get(edge.target)?.inputs[inputIndexFromHandle(edge.targetHandle)];
    if (source && target) source.connect(target);
  }
  await Promise.all([...modules.values()].map((m) => m.whenReady?.()));

  for (let step = 0; step < steps; step++) {
    for (const module of modules.values()) module.scheduleStep?.(step, LEAD_IN + step * stepTime);
  }
  for (const module of modules.values()) module.onStop?.(LEAD_IN + steps * stepTime);
  return ctx.startRendering();
}

// 16-bit PCM WAV.
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const dataBytes = frames * channels * 2;
  const view = new DataView(new ArrayBuffer(44 + dataBytes));
  const text = (offset: number, s: string) => [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true); // byte rate
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, dataBytes, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}
