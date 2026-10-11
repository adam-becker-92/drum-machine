import { useStoreApi, type Edge } from '@xyflow/react';
import { XYHandle } from '@xyflow/system';
import { useCallback, type MouseEvent, type TouchEvent } from 'react';
import { useProjectStore } from '../../state/projectStore';

// Godot-style cable handling: dragging from an input that already has a cable
// picks up that cable's plugged-in end (it unplugs as soon as you move). Drop it
// on another input to re-route it, or anywhere else to leave it unplugged.
//
// This drives React Flow's own connection drag (the same XYHandle call its
// edge-reconnect anchors use), anchored at the cable's source output.
export function useCablePickup() {
  const flowStore = useStoreApi();

  return useCallback(
    (event: MouseEvent | TouchEvent, edge: Edge) => {
      if ('button' in event && event.button !== 0) return;
      const rf = flowStore.getState();
      XYHandle.onPointerDown(event.nativeEvent, {
        autoPanOnConnect: rf.autoPanOnConnect,
        connectionMode: rf.connectionMode,
        connectionRadius: rf.connectionRadius,
        domNode: rf.domNode,
        nodeLookup: rf.nodeLookup,
        lib: rf.lib,
        flowId: rf.rfId,
        panBy: rf.panBy,
        cancelConnection: rf.cancelConnection,
        updateConnection: rf.updateConnection,
        autoPanSpeed: rf.autoPanSpeed,
        dragThreshold: rf.connectionDragThreshold,
        handleDomNode: event.currentTarget as Element,
        // The cable stays attached to its source output; the input end follows the pointer.
        nodeId: edge.source,
        handleId: edge.sourceHandle ?? null,
        isTarget: false,
        edgeUpdaterType: 'source',
        isValidConnection: (connection) => flowStore.getState().isValidConnection?.(connection) ?? true,
        onConnectStart: (evt, params) => {
          useProjectStore.getState().removeEdge(edge.id);
          flowStore.getState().onConnectStart?.(evt, params);
        },
        onConnect: (connection) => useProjectStore.getState().onConnect(connection),
        onConnectEnd: (evt, state) => flowStore.getState().onConnectEnd?.(evt, state),
        getTransform: () => flowStore.getState().transform,
        getFromHandle: () => flowStore.getState().connection.fromHandle,
      });
    },
    [flowStore],
  );
}
