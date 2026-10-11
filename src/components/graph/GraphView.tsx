import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { NODE_DEFINITIONS, getNodeDefinition } from '../../audio/core/nodeRegistry';
import { useProjectStore, useTransportStore, wouldCreateCycle, type SynthNode } from '../../state/projectStore';
import { NODE_DRAG_MIME, NodeMenu } from './NodeMenu';
import { SynthNodeView } from './SynthNodeView';

const nodeTypes = Object.fromEntries(NODE_DEFINITIONS.map((def) => [def.type, SynthNodeView]));

function GraphCanvas() {
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const onNodesChange = useProjectStore((s) => s.onNodesChange);
  const onEdgesChange = useProjectStore((s) => s.onEdgesChange);
  const onConnect = useProjectStore((s) => s.onConnect);
  const addNode = useProjectStore((s) => s.addNode);
  const setViewport = useProjectStore((s) => s.setViewport);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const { screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // Read once: React Flow owns the viewport after mount, we just persist it.
  const [initialViewport] = useState(() => useProjectStore.getState().viewport);

  // Colour each cable by the node it comes from, and animate while playing.
  const styledEdges = useMemo(() => {
    const colors = new Map(nodes.map((n) => [n.id, getNodeDefinition(n.type)?.color]));
    return edges.map((e) => ({ ...e, animated: isPlaying, style: { stroke: colors.get(e.source), strokeWidth: 2 } }));
  }, [edges, nodes, isPlaying]);

  const isValidConnection = useCallback(
    (c: Connection | Edge) => !wouldCreateCycle(useProjectStore.getState().edges, c.source, c.target),
    [],
  );

  const addAtScreen = (type: string, x: number, y: number) => {
    addNode(type, screenToFlowPosition({ x, y }));
  };

  const addAtCenter = (type: string) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    addAtScreen(type, rect.left + rect.width / 2 - 90, rect.top + rect.height / 2 - 60);
  };

  const onDrop = (e: DragEvent) => {
    const type = e.dataTransfer.getData(NODE_DRAG_MIME);
    if (!type) return;
    e.preventDefault();
    addAtScreen(type, e.clientX, e.clientY);
  };

  const onPaneContextMenu = (e: MouseEvent | globalThis.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="graph-layout">
      <aside className="graph-palette">
        <div className="graph-palette-title">Add node</div>
        <NodeMenu onPick={addAtCenter} draggable />
        <p className="graph-palette-hint">
          Drag or click to add. Wire <b>Out</b> → <b>In</b>. Double-click a node to open its editor. Right-click the
          canvas for a quick menu, Delete removes a selection.
        </p>
      </aside>
      <div
        className="graph-canvas"
        ref={wrapperRef}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={onDrop}
      >
        <ReactFlow<SynthNode>
          nodes={nodes}
          edges={styledEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={() => setMenu(null)}
          onMoveEnd={(_, viewport) => setViewport(viewport)}
          defaultViewport={initialViewport ?? undefined}
          fitView={!initialViewport}
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          minZoom={0.2}
          maxZoom={2.5}
          deleteKeyCode={['Delete', 'Backspace']}
          colorMode="dark"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
          <Controls />
          <MiniMap
            pannable
            zoomable
            style={{ width: 150, height: 100 }}
            nodeColor={(n) => getNodeDefinition(n.type)?.color ?? '#888'}
            maskColor="rgba(0, 0, 0, 0.6)"
          />
        </ReactFlow>
        {menu && (
          <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(null)}>
            <NodeMenu
              onPick={(type) => {
                addAtScreen(type, menu.x, menu.y);
                setMenu(null);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function GraphView() {
  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  );
}
