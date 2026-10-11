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
import { findEdgeNearPoint, findEdgeUnderRect } from './edgeGeometry';
import { NodeMenu } from './NodeMenu';
import { NODE_DRAG_MIME, canSpliceIntoCable, endPaletteDrag, paletteDragType } from './paletteDrag';
import { SynthNodeView } from './SynthNodeView';

const nodeTypes = Object.fromEntries(NODE_DEFINITIONS.map((def) => [def.type, SynthNodeView]));

// New nodes are placed so the pointer holds them by the middle of the title bar.
const GRAB_OFFSET = { x: 90, y: 16 };
// How close (in screen pixels) a palette drop must be to a cable to splice into it.
const DROP_SPLICE_TOLERANCE = 24;

function GraphCanvas() {
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const onNodesChange = useProjectStore((s) => s.onNodesChange);
  const onEdgesChange = useProjectStore((s) => s.onEdgesChange);
  const onConnect = useProjectStore((s) => s.onConnect);
  const reconnectEdge = useProjectStore((s) => s.reconnectEdge);
  const removeEdge = useProjectStore((s) => s.removeEdge);
  const insertNodeOnEdge = useProjectStore((s) => s.insertNodeOnEdge);
  const addNode = useProjectStore((s) => s.addNode);
  const setViewport = useProjectStore((s) => s.setViewport);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const { screenToFlowPosition, getInternalNode, getZoom } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reconnectSucceeded = useRef(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // The cable that would receive the node being dragged/dropped right now.
  const [spliceEdgeId, setSpliceEdgeId] = useState<string | null>(null);
  // Read once: React Flow owns the viewport after mount, we just persist it.
  const [initialViewport] = useState(() => useProjectStore.getState().viewport);

  // Colour each cable by the node it comes from, animate while playing, and
  // light up the cable a dragged node is about to be spliced into.
  const styledEdges = useMemo(() => {
    const colors = new Map(nodes.map((n) => [n.id, getNodeDefinition(n.type)?.color]));
    return edges.map((e) => ({
      ...e,
      animated: isPlaying,
      className: e.id === spliceEdgeId ? 'splice-target' : undefined,
      style: { stroke: e.id === spliceEdgeId ? '#ffffff' : colors.get(e.source), strokeWidth: e.id === spliceEdgeId ? 4 : 2 },
    }));
  }, [edges, nodes, isPlaying, spliceEdgeId]);

  const isValidConnection = useCallback(
    (c: Connection | Edge) => !wouldCreateCycle(useProjectStore.getState().edges, c.source, c.target),
    [],
  );

  const flowPointAt = (clientX: number, clientY: number) => screenToFlowPosition({ x: clientX, y: clientY });

  const addAt = (type: string, clientX: number, clientY: number): string | null => {
    const p = flowPointAt(clientX, clientY);
    return addNode(type, { x: p.x - GRAB_OFFSET.x, y: p.y - GRAB_OFFSET.y });
  };

  const addAtCenter = (type: string) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) addAt(type, rect.left + rect.width / 2, rect.top + rect.height / 2 - 40);
  };

  // --- Splicing a node into a cable -------------------------------------

  const spliceCandidate = (node: SynthNode): string | null => {
    const { edges: current } = useProjectStore.getState();
    if (!canSpliceIntoCable(node.type)) return null;
    if (current.some((e) => e.source === node.id || e.target === node.id)) return null;
    const width = node.measured?.width ?? 180;
    const height = node.measured?.height ?? 100;
    return findEdgeUnderRect(current, { x: node.position.x, y: node.position.y, width, height }, getInternalNode);
  };

  const onNodeDrag = (_: unknown, node: SynthNode, dragged: SynthNode[]) => {
    setSpliceEdgeId(dragged.length === 1 ? spliceCandidate(node) : null);
  };

  const onNodeDragStop = (_: unknown, node: SynthNode, dragged: SynthNode[]) => {
    const edgeId = dragged.length === 1 ? spliceCandidate(node) : null;
    if (edgeId) insertNodeOnEdge(node.id, edgeId);
    setSpliceEdgeId(null);
  };

  const dropSpliceCandidate = (clientX: number, clientY: number): string | null => {
    if (!canSpliceIntoCable(paletteDragType())) return null;
    const tolerance = DROP_SPLICE_TOLERANCE / getZoom();
    return findEdgeNearPoint(useProjectStore.getState().edges, flowPointAt(clientX, clientY), tolerance, getInternalNode);
  };

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(NODE_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setSpliceEdgeId(dropSpliceCandidate(e.clientX, e.clientY));
  };

  const onDrop = (e: DragEvent) => {
    const type = e.dataTransfer.getData(NODE_DRAG_MIME);
    if (!type) return;
    e.preventDefault();
    const edgeId = dropSpliceCandidate(e.clientX, e.clientY);
    const nodeId = addAt(type, e.clientX, e.clientY);
    if (nodeId && edgeId) insertNodeOnEdge(nodeId, edgeId);
    setSpliceEdgeId(null);
    endPaletteDrag();
  };

  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setSpliceEdgeId(null);
  };

  // --- Grabbing a cable end: drop on a port to re-route, anywhere else to unplug.

  const onReconnectStart = () => {
    reconnectSucceeded.current = false;
  };

  const onReconnect = (oldEdge: Edge, connection: Connection) => {
    reconnectSucceeded.current = true;
    reconnectEdge(oldEdge, connection);
  };

  const onReconnectEnd = (_: unknown, edge: Edge) => {
    if (!reconnectSucceeded.current) removeEdge(edge.id);
    reconnectSucceeded.current = true;
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
        <ul className="graph-palette-hint">
          <li>
            Drag or click to add. Wire <b>Out</b> → <b>In</b>.
          </li>
          <li>Drop an effect onto a cable to splice it in.</li>
          <li>Drag a cable off an input to unplug it, or onto another input to re-route.</li>
          <li>Double-click a node to open its editor. Right-click the canvas for a quick menu.</li>
          <li>
            Select an instrument (or open its tab) and play it from your computer keyboard: <b>A</b>–<b>;</b>, octave{' '}
            <b>Z</b>/<b>X</b>.
          </li>
        </ul>
      </aside>
      <div
        className="graph-canvas"
        ref={wrapperRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
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
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onReconnectStart={onReconnectStart}
          onReconnect={onReconnect}
          onReconnectEnd={onReconnectEnd}
          reconnectRadius={14}
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
                addAt(type, menu.x, menu.y);
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
