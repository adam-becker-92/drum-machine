import type { CSSProperties } from 'react';
import { getNodeDefinition } from '../../audio/core/nodeRegistry';
import { GRAPH_TAB, useProjectStore } from '../../state/projectStore';
import { ParamPanel } from '../ParamControl';
import { Scope } from '../Scope';
import { DrumMachineEditor } from './DrumMachineEditor';

export function NodeEditor({ nodeId }: { nodeId: string }) {
  const node = useProjectStore((s) => s.nodes.find((n) => n.id === nodeId));
  const updateParams = useProjectStore((s) => s.updateParams);
  const renameNode = useProjectStore((s) => s.renameNode);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const def = getNodeDefinition(node?.type);
  if (!node || !def) return <div className="editor-empty">This node no longer exists.</div>;

  return (
    <div className="node-editor" style={{ '--node-color': def.color } as CSSProperties}>
      <header className="node-editor-header">
        <span className="node-editor-icon">{def.icon}</span>
        <div className="node-editor-title">
          <input
            className="node-editor-name"
            value={node.data.name}
            onChange={(e) => renameNode(node.id, e.target.value)}
            aria-label="Node name"
          />
          <span className="node-editor-desc">
            {def.label} · {def.description}
          </span>
        </div>
        <button type="button" className="ghost-button" onClick={() => setActiveTab(GRAPH_TAB)}>
          ← Synth Graph
        </button>
      </header>

      {node.type === 'drumMachine' ? (
        <DrumMachineEditor node={node} />
      ) : (
        <section className="editor-card generic-editor">
          {node.type === 'master' && (
            <div className="editor-scope">
              <Scope nodeId={node.id} width={560} height={140} />
            </div>
          )}
          <ParamPanel
            specs={def.params}
            values={node.data.params}
            onChange={(key, value) => updateParams(node.id, { [key]: value })}
            size={72}
            color={def.color}
          />
        </section>
      )}
    </div>
  );
}
