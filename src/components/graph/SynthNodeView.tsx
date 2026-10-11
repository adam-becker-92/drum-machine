import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CSSProperties } from 'react';
import { getNodeDefinition } from '../../audio/core/nodeRegistry';
import { OUTPUT_HANDLE, inputHandleId } from '../../audio/core/types';
import { STEP_COUNT, TRACKS } from '../../audio/tracks';
import { useProjectStore, useTransportStore, type SynthNode } from '../../state/projectStore';
import { ParamControl } from '../ParamControl';
import { Scope } from '../Scope';

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

export function SynthNodeView({ id, type, data, selected }: NodeProps<SynthNode>) {
  const def = getNodeDefinition(type);
  const updateParams = useProjectStore((s) => s.updateParams);
  const openTab = useProjectStore((s) => s.openTab);
  if (!def) return null;

  const rows = Math.max(def.inputs.length, def.hasOutput ? 1 : 0);
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
        {Array.from({ length: rows }, (_, i) => (
          <div className="port-row" key={i}>
            {def.inputs[i] !== undefined && (
              <>
                <Handle type="target" position={Position.Left} id={inputHandleId(i)} className="port port-in" />
                <span className="port-label in">{def.inputs[i]}</span>
              </>
            )}
            {i === 0 && def.hasOutput && (
              <>
                <span className="port-label out">Out</span>
                <Handle type="source" position={Position.Right} id={OUTPUT_HANDLE} className="port port-out" />
              </>
            )}
          </div>
        ))}
      </div>

      {type === 'drumMachine' && <DrumPreview nodeId={id} />}
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
