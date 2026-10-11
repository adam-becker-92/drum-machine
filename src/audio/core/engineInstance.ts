import { useProjectStore } from '../../state/projectStore';
import { AudioEngine } from './AudioEngine';

// One engine for the whole app, bound to the project store.
export const engine = new AudioEngine();
const unbind = engine.bind(useProjectStore);

// Browsers start the AudioContext suspended until the first user gesture.
const resumeOnGesture = () => void engine.resume();
window.addEventListener('pointerdown', resumeOnGesture, { once: true });
window.addEventListener('keydown', resumeOnGesture, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unbind();
    engine.destroy();
  });
}
