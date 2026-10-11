import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getNodeDefinition } from '../../audio/core/nodeRegistry';
import { NOTES_IN_HANDLE, NOTES_OUT_HANDLE, OUTPUT_HANDLE, inputHandleId } from '../../audio/core/types';
import { STEP_COUNT, TRACKS } from '../../audio/tracks';
import { useProjectStore, useTransportStore, type SynthNode } from '../../state/projectStore';
import { ParamControl } from '../ParamControl';
import { Scope } from '../Scope';
import { useCablePickup } from './useCablePickup';

function DrumPreview({ nodeId }: { nodeId: string }) {
  const clip = useProjectStore((s) => s.clips[nodeId]);
  const currentStep = useTransportStore((s) => s.currentStep);
  if (clip?.kind !== 'drum') return null;
  const playhead = currentStep < 0 ? -1 : currentStep % STEP_COUNT;
  return (
    <div className="drum-preview" aria-hidden>
      {TRACKS.map((track) => (
        <div key={track.id} className="drum-preview-row">
          {Array.from({ length: STEP_COUNT }, (_, s) => (
            <span
              key={s}
              className={[clip.pattern[track.id]?.[s] ? 'on' : '', s === playhead ? 'now' : ''].join(' ')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Thumbnail of a note clip with its playhead.
function NotesPreview({ nodeId }: { nodeId: string }) {
  const clip = useProjectStore((s) => s.clips[nodeId]);
  const currentStep = useTransportStore((s) => s.currentStep);
  if (clip?.kind !== 'notes') return null;
  const pitches = clip.notes.map((n) => n.pitch);
  const lo = pitches.length ? Math.min(...pitches) : 60;
  const span = Math.max(12, (pitches.length ? Math.max(...pitches) : 72) - lo + 1);
  const pct = (v: number) => `${v * 100}%`;
  return (
    <div className="notes-preview" aria-hidden>
      {clip.notes.map((n) => (
        <span
          key={n.id}
          style={{
            left: pct(n.start / clip.length),
            width: pct(n.length / clip.length),
            top: pct((lo + span - 1 - n.pitch) / span),
            height: pct(1 / span),
          }}
        />
      ))}
      {currentStep >= 0 && <i style={{ left: pct((currentStep % clip.length) / clip.length) }} />}
    </div>
  );
}

export function SynthNodeView({ id, type, data, selected }: NodeProps<SynthNode>) {
  const def = getNodeDefinition(type);
  const updateParams = useProjectStore((s) => s.updateParams);
  const openTab = useProjectStore((s) => s.openTab);
  const incoming = useProjectStore(useShallow((s) => s.edges.filter((e) => e.target === id)));
  const pickUpCable = useCablePickup();
  if (!def) return null;

  // The most recently plugged cable on an input is the one a drag picks up.
  const cableAt = (handle: string) => incoming.findLast((e) => e.targetHandle === handle);

  // Audio ports, plus note (MIDI) ports drawn as diamonds.
  const inputs = def.inputs.map((label, i) => ({ id: inputHandleId(i), label, note: false }));
  if (def.playable) inputs.push({ id: NOTES_IN_HANDLE, label: 'Notes', note: true });
  const outputs = [
    ...(def.hasOutput ? [{ id: OUTPUT_HANDLE, label: 'Out', note: false }] : []),
    ...(def.noteOutput ? [{ id: NOTES_OUT_HANDLE, label: 'Notes', note: true }] : []),
  ];
  const rows = Math.max(inputs.length, outputs.length);
  const inlineSpecs = def.inlineParams
    .map((key) => def.params.find((p) => p.key === key))
    .filter((spec) => spec !== undefined);

  return (
    <div
      className={`synth-node ${selected ? 'selected' : ''}`}
      style={{ '--node-color': def.color } as CSSProperties}
      onDoubleClick={() => openTab(id)}
    >
      <div className="synth-node-header">
        <span className="synth-node-icon">{def.icon}</span>
        <span className="synth-node-name">{data.name}</span>
        <button
          type="button"
          className="synth-node-open nodrag"
          onClick={() => openTab(id)}
          title="Open editor tab"
          aria-label={`Open ${data.name} editor`}
        >
          ⤢
        </button>
      </div>

      <div className="synth-node-ports">
        {Array.from({ length: rows }, (_, i) => {
          const input = inputs[i];
          const output = outputs[i];
          const cable = input && cableAt(input.id);
          return (
            <div className="port-row" key={i}>
              {input && (
                <>
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={input.id}
                    className={`port port-in ${input.note ? 'note-port' : ''} ${cable ? 'plugged' : ''}`}
                    isConnectableStart={!cable}
                    onMouseDown={cable ? (e) => pickUpCable(e, cable) : undefined}
                    onTouchStart={cable ? (e) => pickUpCable(e, cable) : undefined}
                    title={cable ? 'Drag to unplug or re-route; right-click to unhook' : undefined}
                  />
                  <span className="port-label in">{input.label}</span>
                </>
              )}
              {output && (
                <>
                  <span className="port-label out">{output.label}</span>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={output.id}
                    className={`port port-out ${output.note ? 'note-port' : ''}`}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {type === 'drumMachine' && <DrumPreview nodeId={id} />}
      {def.playable && <NotesPreview nodeId={id} />}
      {type === 'master' && (
        <div className="synth-node-scope">
          <Scope nodeId={id} width={150} height={44} />
        </div>
      )}

      {inlineSpecs.length > 0 && (
        <div className="synth-node-knobs">
          {inlineSpecs.map((spec) => (
            <ParamControl
              key={spec.key}
              spec={spec}
              value={data.params[spec.key]}
              onChange={(v) => updateParams(id, { [spec.key]: v })}
              size={32}
              color={def.color}
              nodeId={id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
