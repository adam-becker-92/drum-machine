import { STEP_COUNT, TRACKS } from '../audio/tracks';
import type { Pattern } from '../audio/types';

interface StepGridProps {
  pattern: Pattern;
  currentStep: number;
  onToggleStep: (trackId: string, step: number) => void;
}

export function StepGrid({ pattern, currentStep, onToggleStep }: StepGridProps) {
  const steps = Array.from({ length: STEP_COUNT }, (_, i) => i);

  return (
    <div className="step-grid">
      {TRACKS.map((track) => (
        <div className="track-row" key={track.id}>
          <div className="track-label">
            <span className="track-short">{track.shortName}</span>
            <span className="track-name">{track.name}</span>
          </div>
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
