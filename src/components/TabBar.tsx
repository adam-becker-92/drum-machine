import type { CSSProperties } from 'react';
import { getNodeDefinition } from '../audio/core/nodeRegistry';
import { GRAPH_TAB, useProjectStore } from '../state/projectStore';

export function TabBar() {
  const openTabs = useProjectStore((s) => s.openTabs);
  const activeTab = useProjectStore((s) => s.activeTab);
  const nodes = useProjectStore((s) => s.nodes);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const closeTab = useProjectStore((s) => s.closeTab);

  return (
    <nav className="tab-bar" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === GRAPH_TAB}
        className={`tab graph-tab ${activeTab === GRAPH_TAB ? 'active' : ''}`}
        onClick={() => setActiveTab(GRAPH_TAB)}
      >
        <span className="tab-icon">◇</span>
        Synth Graph
      </button>
      {openTabs.map((id) => {
        const node = nodes.find((n) => n.id === id);
        const def = getNodeDefinition(node?.type);
        if (!node || !def) return null;
        return (
          <div
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            className={`tab ${activeTab === id ? 'active' : ''}`}
            style={{ '--node-color': def.color } as CSSProperties}
            onClick={() => setActiveTab(id)}
            onAuxClick={(e) => e.button === 1 && closeTab(id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveTab(id)}
            tabIndex={0}
          >
            <span className="tab-icon">{def.icon}</span>
            {node.data.name}
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${node.data.name}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </nav>
  );
}
