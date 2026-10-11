interface TransportProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  bpm: number;
  minBpm: number;
  maxBpm: number;
  onBpmChange: (bpm: number) => void;
  onClear: () => void;
}

export function Transport({ isPlaying, onTogglePlay, bpm, minBpm, maxBpm, onBpmChange, onClear }: TransportProps) {
  return (
    <div className="transport">
      <button
        type="button"
        className={`play-button ${isPlaying ? 'playing' : ''}`}
        onClick={onTogglePlay}
        title="Play / stop (Space)"
      >
        {isPlaying ? 'STOP' : 'PLAY'}
      </button>

      <label className="bpm-control">
        <span>TEMPO</span>
        <input
          type="number"
          min={minBpm}
          max={maxBpm}
          value={bpm}
          onChange={(e) => onBpmChange(Number(e.target.value))}
        />
        <span className="bpm-unit">BPM</span>
      </label>

      <button
        type="button"
        className="clear-button"
        onClick={onClear}
        title="Clear every pattern in the project (keeps your graph and sounds)"
      >
        CLEAR
      </button>
    </div>
  );
}
