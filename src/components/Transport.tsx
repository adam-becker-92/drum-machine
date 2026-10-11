interface TransportProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  bpm: number;
  minBpm: number;
  maxBpm: number;
  onBpmChange: (bpm: number) => void;
  onClear: () => void;
  samplesReady: boolean;
}

export function Transport({
  isPlaying,
  onTogglePlay,
  bpm,
  minBpm,
  maxBpm,
  onBpmChange,
  onClear,
  samplesReady,
}: TransportProps) {
  return (
    <div className="transport">
      <button
        type="button"
        className={`play-button ${isPlaying ? 'playing' : ''}`}
        onClick={onTogglePlay}
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

      <button type="button" className="clear-button" onClick={onClear}>
        CLEAR
      </button>

      <span className="sample-status">
        {samplesReady ? '' : 'loading audio engine…'}
      </span>
    </div>
  );
}
