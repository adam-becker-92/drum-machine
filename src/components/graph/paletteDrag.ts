import { getNodeDefinition } from '../../audio/core/nodeRegistry';

export const NODE_DRAG_MIME = 'application/x-cheeky-node';

// HTML drag-and-drop hides the payload until drop, so the palette records which
// node type is in flight for dragover previews (e.g. highlighting a cable).
let draggingType: string | null = null;

export function beginPaletteDrag(type: string) {
  draggingType = type;
}

export function endPaletteDrag() {
  draggingType = null;
}

export function paletteDragType(): string | null {
  return draggingType;
}

// Effects and utilities (one input and an output) can be spliced into a cable.
export function canSpliceIntoCable(type: string | null | undefined): boolean {
  const def = getNodeDefinition(type ?? undefined);
  return !!def && def.inputs.length > 0 && def.hasOutput;
}
