import { useEffect } from 'react';
import './App.css';
import { engine } from './audio/core/engineInstance';
import { NodeEditor } from './components/editors/NodeEditor';
import { GraphView } from './components/graph/GraphView';
import { TabBar } from './components/TabBar';
import { Transport } from './components/Transport';
import { GRAPH_TAB, MAX_BPM, MIN_BPM, useProjectStore, useTransportStore } from './state/projectStore';

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
  const resetProject = useProjectStore((s) => s.resetProject);
  const isPlaying = useTransportStore((s) => s.isPlaying);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTypingTarget(e.target)) return;
      e.preventDefault();
      engine.togglePlay();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const onNewProject = () => {
    if (window.confirm('Start a new project? The current graph and patterns will be replaced.')) {
      engine.stop();
      resetProject();
    }
  };

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
        />
        <button type="button" className="ghost-button" onClick={onNewProject}>
          New project
        </button>
      </header>

      <TabBar />

      <main className="app-content">
        {activeTab === GRAPH_TAB ? <GraphView /> : <NodeEditor key={activeTab} nodeId={activeTab} />}
      </main>
    </div>
  );
}

export default App;
