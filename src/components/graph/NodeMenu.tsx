import type { CSSProperties, DragEvent } from 'react';
import { CATEGORY_LABELS, NODE_DEFINITIONS } from '../../audio/core/nodeRegistry';
import type { NodeCategory } from '../../audio/core/types';
import { useProjectStore } from '../../state/projectStore';
import { NODE_DRAG_MIME, beginPaletteDrag, endPaletteDrag } from './paletteDrag';

const CATEGORIES: NodeCategory[] = ['source', 'control', 'effect', 'utility', 'output'];

interface NodeMenuProps {
  onPick: (type: string) => void;
  draggable?: boolean;
}

// Node type list grouped by category; used for both the sidebar palette and
// the right-click "add node" menu.
export function NodeMenu({ onPick, draggable }: NodeMenuProps) {
  const nodes = useProjectStore((s) => s.nodes);

  const onDragStart = (e: DragEvent, type: string) => {
    e.dataTransfer.setData(NODE_DRAG_MIME, type);
    e.dataTransfer.effectAllowed = 'move';
    beginPaletteDrag(type);
  };

  return (
    <div className="node-menu">
      {CATEGORIES.map((category) => {
        const defs = NODE_DEFINITIONS.filter((d) => d.category === category);
        if (!defs.length) return null;
        return (
          <div key={category} className="node-menu-group">
            <div className="node-menu-heading">{CATEGORY_LABELS[category]}</div>
            {defs.map((def) => {
              const disabled = def.singleton && nodes.some((n) => n.type === def.type);
              return (
                <button
                  key={def.type}
                  type="button"
                  className="node-menu-item"
                  style={{ '--node-color': def.color } as CSSProperties}
                  disabled={disabled}
                  draggable={draggable && !disabled}
                  onDragStart={(e) => onDragStart(e, def.type)}
                  onDragEnd={endPaletteDrag}
                  onClick={() => onPick(def.type)}
                  title={disabled ? 'Only one allowed' : def.description}
                >
                  <span className="node-menu-icon">{def.icon}</span>
                  {def.label}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
