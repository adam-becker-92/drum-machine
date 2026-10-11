import './App.css';
import { StepGrid } from './components/StepGrid';
import { Transport } from './components/Transport';
import { useDrumMachine } from './hooks/useDrumMachine';

function App() {
  const {
    pattern,
    toggleStep,
    clearPattern,
    bpm,
    setBpm,
    minBpm,
    maxBpm,
    isPlaying,
    togglePlay,
    currentStep,
    samplesReady,
  } = useDrumMachine();

  return (
    <div className="drum-machine">
      <header className="header">
        <h1>TR&#8209;909</h1>
        <span className="subtitle">rhythm composer</span>
      </header>

      <Transport
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        bpm={bpm}
        minBpm={minBpm}
        maxBpm={maxBpm}
        onBpmChange={setBpm}
        onClear={clearPattern}
        samplesReady={samplesReady}
      />

      <StepGrid pattern={pattern} currentStep={currentStep} onToggleStep={toggleStep} />
    </div>
  );
}

export default App;
