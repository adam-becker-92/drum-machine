import { useState } from 'react';
import { STEP_COUNT, TRACKS } from '../audio/tracks';
import type { Pattern } from '../audio/types';

interface StepGridProps {
  pattern: Pattern;
  currentStep: number;
  onToggleStep: (trackId: string, step: number) => void;
  selectedTrack?: string;
  mutedTracks?: Set<string>;
  // Clicking a track label selects it (and auditions the voice).
  onSelectTrack?: (trackId: string) => void;
  // Computer key that plays each voice, shown as a key cap on its label.
  keyHints?: Record<string, string>;
  // An audio file dropped onto a row.
  onDropFile?: (trackId: string, file: File) => void;
}

export function StepGrid({
  pattern,
  currentStep,
  onToggleStep,
  selectedTrack,
  mutedTracks,
  onSelectTrack,
  keyHints,
  onDropFile,
}: StepGridProps) {
  const steps = Array.from({ length: STEP_COUNT }, (_, i) => i);
  const [dropRow, setDropRow] = useState<string | null>(null);

  return (
    <div className="step-grid">
      {TRACKS.map((track) => (
        <div
          className={[
            'track-row',
            track.id === selectedTrack ? 'selected' : '',
            mutedTracks?.has(track.id) ? 'muted' : '',
            dropRow === track.id ? 'drag-over' : '',
          ].join(' ')}
          key={track.id}
          onDragOver={(e) => {
            if (!onDropFile || !e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            setDropRow(track.id);
          }}
          onDragLeave={() => setDropRow(null)}
          onDrop={(e) => {
            if (!onDropFile) return;
            e.preventDefault();
            setDropRow(null);
            const file = e.dataTransfer.files[0];
            if (file) onDropFile(track.id, file);
          }}
        >
          <button
            type="button"
            className="track-label"
            onClick={() => onSelectTrack?.(track.id)}
            title="Select voice and audition"
          >
            <span className="track-short">
              {track.shortName}
              {keyHints?.[track.id] && <kbd className="track-key">{keyHints[track.id]}</kbd>}
            </span>
            <span className="track-name">{track.name}</span>
          </button>
          <div className="steps">
            {steps.map((step) => {
              const active = pattern[track.id]?.[step] ?? false;
              const isBeatStart = step % 4 === 0;
              const isCurrent = step === currentStep;
              return (
                <button
                  key={step}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${track.name} step ${step + 1}`}
                  className={[
                    'step',
                    active ? 'active' : '',
                    isBeatStart ? 'beat-start' : '',
                    isCurrent ? 'current' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onToggleStep(track.id, step)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
