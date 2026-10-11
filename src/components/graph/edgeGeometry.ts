import type { Edge, InternalNode, XYPosition } from '@xyflow/react';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type GetInternalNode = (id: string) => InternalNode | undefined;

const SAMPLES = 32;
// React Flow's default bezier curvature, so our hit-testing matches the drawn cable.
const CURVATURE = 0.25;

function controlOffset(distance: number): number {
  return distance >= 0 ? 0.5 * distance : CURVATURE * 25 * Math.sqrt(-distance);
}

// Cable end points in flow coordinates: right edge of the output handle,
// left edge of the input handle (same as React Flow's getHandlePosition).
function edgeEndpoints(edge: Edge, getInternalNode: GetInternalNode): [XYPosition, XYPosition] | null {
  const sourceNode = getInternalNode(edge.source);
  const targetNode = getInternalNode(edge.target);
  const sourceHandle = sourceNode?.internals.handleBounds?.source?.find((h) => h.id === edge.sourceHandle);
  const targetHandle = targetNode?.internals.handleBounds?.target?.find((h) => h.id === edge.targetHandle);
  if (!sourceNode || !targetNode || !sourceHandle || !targetHandle) return null;
  const s = sourceNode.internals.positionAbsolute;
  const t = targetNode.internals.positionAbsolute;
  return [
    { x: s.x + sourceHandle.x + sourceHandle.width, y: s.y + sourceHandle.y + sourceHandle.height / 2 },
    { x: t.x + targetHandle.x, y: t.y + targetHandle.y + targetHandle.height / 2 },
  ];
}

function sampleCable(source: XYPosition, target: XYPosition): XYPosition[] {
  const offset = controlOffset(target.x - source.x);
  const c1 = { x: source.x + offset, y: source.y };
  const c2 = { x: target.x - offset, y: target.y };
  const points: XYPosition[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    points.push({
      x: a * source.x + b * c1.x + c * c2.x + d * target.x,
      y: a * source.y + b * c1.y + c * c2.y + d * target.y,
    });
  }
  return points;
}

function distanceToSegment(p: XYPosition, a: XYPosition, b: XYPosition): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToPolyline(p: XYPosition, points: XYPosition[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegment(p, points[i - 1], points[i]));
  return best;
}

// Liang–Barsky clip test: does segment a-b pass through the rectangle?
function segmentHitsRect(a: XYPosition, b: XYPosition, r: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, a.x - r.x],
    [dx, r.x + r.width - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.height - a.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function polylineHitsRect(points: XYPosition[], r: Rect): boolean {
  for (let i = 1; i < points.length; i++) {
    if (segmentHitsRect(points[i - 1], points[i], r)) return true;
  }
  return false;
}

// The cable passing under a dragged node (closest to its centre if several do).
export function findEdgeUnderRect(edges: Edge[], rect: Rect, getInternalNode: GetInternalNode): string | null {
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  let best: { id: string; distance: number } | null = null;
  for (const edge of edges) {
    const ends = edgeEndpoints(edge, getInternalNode);
    if (!ends) continue;
    const points = sampleCable(ends[0], ends[1]);
    if (!polylineHitsRect(points, rect)) continue;
    const distance = distanceToPolyline(centre, points);
    if (!best || distance < best.distance) best = { id: edge.id, distance };
  }
  return best?.id ?? null;
}

// The cable within `tolerance` of a point (used while dropping from the palette).
export function findEdgeNearPoint(
  edges: Edge[],
  point: XYPosition,
  tolerance: number,
  getInternalNode: GetInternalNode,
): string | null {
  let best: { id: string; distance: number } | null = null;
  for (const edge of edges) {
    const ends = edgeEndpoints(edge, getInternalNode);
    if (!ends) continue;
    const distance = distanceToPolyline(point, sampleCable(ends[0], ends[1]));
    if (distance <= tolerance && (!best || distance < best.distance)) best = { id: edge.id, distance };
  }
  return best?.id ?? null;
}
