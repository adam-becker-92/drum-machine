import { useCallback, useEffect, useState } from 'react';
import './App.css';
import { engine } from './audio/core/engineInstance';
import { NodeEditor } from './components/editors/NodeEditor';
import { GraphView } from './components/graph/GraphView';
import { TabBar } from './components/TabBar';
import { Transport } from './components/Transport';
import { UndoToast } from './components/UndoToast';
import {
  GRAPH_TAB,
  MAX_BPM,
  MIN_BPM,
  pickProjectData,
  useProjectStore,
  useTransportStore,
  type ProjectData,
} from './state/projectStore';

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function App() {
  const activeTab = useProjectStore((s) => s.activeTab);
  const bpm = useProjectStore((s) => s.bpm);
  const setBpm = useProjectStore((s) => s.setBpm);
  const clearAllClips = useProjectStore((s) => s.clearAllClips);
  const resetProject = useProjectStore((s) => s.resetProject);
  const loadProject = useProjectStore((s) => s.loadProject);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const [undo, setUndo] = useState<{ message: string; snapshot: ProjectData } | null>(null);
  // Bumped when the whole project is swapped so the graph re-reads (or re-fits) its view.
  const [graphKey, setGraphKey] = useState(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTypingTarget(e.target)) return;
      e.preventDefault();
      engine.togglePlay();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const withUndo = (message: string, action: () => void) => {
    const snapshot = pickProjectData(useProjectStore.getState());
    action();
    setUndo({ message, snapshot });
  };

  // Wipes every pattern but keeps playing, so you can rebuild a groove live.
  const onClear = () => withUndo('Cleared all patterns', clearAllClips);

  const onReset = () =>
    withUndo('Project reset to the starter patch', () => {
      engine.stop();
      resetProject();
      setGraphKey((k) => k + 1);
    });

  const dismissUndo = useCallback(() => setUndo(null), []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <h1>Cheeky Synth</h1>
          <span className="subtitle">modular groovebox</span>
        </div>
        <Transport
          isPlaying={isPlaying}
          onTogglePlay={() => engine.togglePlay()}
          bpm={bpm}
          minBpm={MIN_BPM}
          maxBpm={MAX_BPM}
          onBpmChange={setBpm}
          onClear={onClear}
        />
        <button
          type="button"
          className="ghost-button"
          onClick={onReset}
          title="Stop and replace the whole project with the starter patch"
        >
          Reset
        </button>
      </header>

      <TabBar />

      <main className="app-content">
        {activeTab === GRAPH_TAB ? (
          <GraphView key={graphKey} />
        ) : (
          <NodeEditor key={activeTab} nodeId={activeTab} />
        )}
      </main>

      {undo && (
        <UndoToast
          message={undo.message}
          onUndo={() => {
            loadProject(undo.snapshot);
            setGraphKey((k) => k + 1);
            setUndo(null);
          }}
          onDismiss={dismissUndo}
        />
      )}
    </div>
  );
}

export default App;
