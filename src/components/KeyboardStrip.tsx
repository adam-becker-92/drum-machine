import type { CSSProperties, PointerEvent } from 'react';
import { noteName } from '../audio/dsp';
import { pressNote, releaseNote, useLiveStore } from '../state/liveInput';
import { COMPUTER_KEY_LABELS } from './useComputerKeyboard';

const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_OFFSETS: Record<number, number> = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 }; // black key -> white key it sits after
const WHITE_W = 28;
const OCTAVES = 3;

interface KeyboardStripProps {
  nodeId: string;
  color: string;
}

// Clickable keyboard spanning the computer keyboard's current octave and the
// ones either side; lights up whatever is held from any source.
export function KeyboardStrip({ nodeId, color }: KeyboardStripProps) {
  const held = useLiveStore((s) => s.held);
  const octave = useLiveStore((s) => s.octave);
  const low = (octave + 1) * 12 - 12; // start one octave below the typing octave
  const typingBase = (octave + 1) * 12;

  const keys: { pitch: number; black: boolean; left: number }[] = [];
  for (let o = 0; o < OCTAVES; o++) {
    WHITE_OFFSETS.forEach((offset, i) => keys.push({ pitch: low + o * 12 + offset, black: false, left: (o * 7 + i) * WHITE_W }));
    for (const [offset, after] of Object.entries(BLACK_OFFSETS)) {
      keys.push({ pitch: low + o * 12 + Number(offset), black: true, left: (o * 7 + after + 1) * WHITE_W - 9 });
    }
  }

  const down = (e: PointerEvent, pitch: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pressNote(pitch, 0.8, nodeId);
  };

  return (
    <div className="keyboard-strip" style={{ '--key-color': color } as CSSProperties}>
      <div className="keyboard-keys" style={{ width: OCTAVES * 7 * WHITE_W }}>
        {keys.map(({ pitch, black, left }) => {
          const label = COMPUTER_KEY_LABELS[pitch - typingBase];
          return (
            <button
              key={pitch}
              type="button"
              className={`kb-key ${black ? 'black' : 'white'} ${held.includes(pitch) ? 'held' : ''}`}
              style={{ left }}
              aria-label={noteName(pitch)}
              onPointerDown={(e) => down(e, pitch)}
              onPointerUp={() => releaseNote(pitch)}
              onPointerCancel={() => releaseNote(pitch)}
            >
              {label && <span className="kb-hint">{label}</span>}
              {pitch % 12 === 0 && <span className="kb-name">{noteName(pitch)}</span>}
            </button>
          );
        })}
      </div>
      <p className="keyboard-help">
        Play with your computer keyboard: <b>A</b>–<b>;</b> are the white keys, <b>W E T Y U O P</b> the black keys,{' '}
        <b>Z</b>/<b>X</b> shift octave, hold <b>Shift</b> for full velocity (accents on the Bass Synth).
      </p>
    </div>
  );
}
