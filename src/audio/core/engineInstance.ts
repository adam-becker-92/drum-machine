import { pickProjectData, useProjectStore, useTransportStore } from '../../state/projectStore';
import { AudioEngine } from './AudioEngine';
import { defaultParams, getNodeDefinition } from './nodeRegistry';

declare global {
  interface Window {
    __cheekyEngine?: AudioEngine;
    // Dev-only handle for inspecting the live instances from the console.
    __cheeky?: {
      engine: AudioEngine;
      project: typeof useProjectStore;
      transport: typeof useTransportStore;
      registry: { getNodeDefinition: typeof getNodeDefinition; defaultParams: typeof defaultParams };
      renderProject?: (bars: number) => Promise<AudioBuffer>;
    };
  }
}

// Exactly one engine may exist per page. A hot reload (or a second copy of
// this module) would otherwise leave an orphaned engine playing stale state
// that the UI can no longer reach, so always tear down the previous one.
const previous = window.__cheekyEngine;
const wasPlaying = previous?.isPlaying ?? false;
previous?.destroy();

export const engine = new AudioEngine();
window.__cheekyEngine = engine;
engine.bind(useProjectStore);
if (wasPlaying) void engine.play();

// Browsers start the AudioContext suspended until the first user gesture.
const resumeOnGesture = () => void engine.resume();
window.addEventListener('pointerdown', resumeOnGesture, { once: true });
window.addEventListener('keydown', resumeOnGesture, { once: true });

if (import.meta.env.DEV) {
  window.__cheeky = {
    engine,
    project: useProjectStore,
    transport: useTransportStore,
    registry: { getNodeDefinition, defaultParams },
  };
  // Loaded lazily so the debug hook doesn't pull export code into startup.
  void import('../../io/wavExport').then(({ renderProject }) => {
    if (window.__cheeky) {
      window.__cheeky.renderProject = (bars) =>
        renderProject(pickProjectData(useProjectStore.getState()), bars, engine.ctx.sampleRate);
    }
  });
}
