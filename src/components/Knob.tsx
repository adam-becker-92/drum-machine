import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { noteName } from '../audio/dsp';
import { SWEEP, followPointer, fromNorm, startKnobDrag, toNorm, type KnobDrag } from './knobMath';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  scale?: 'linear' | 'log';
  unit?: string;
  // Snap to multiples of this (e.g. 1 for semitones).
  step?: number;
  size?: number;
  color?: string;
  onChange: (value: number) => void;
}

function formatValue(value: number, unit?: string): string {
  if (unit === 'note') return noteName(Math.round(value));
  if (unit === 'st') return `${value > 0 ? '+' : ''}${Math.round(value)}st`;
  if (unit === 'ct') return `${value > 0 ? '+' : ''}${Math.round(value)}ct`;
  if (unit === 'Hz' && value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}${unit && unit !== 'Hz' ? unit : ''}`;
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const sx = cx + r * Math.cos(rad(startDeg));
  const sy = cy + r * Math.sin(rad(startDeg));
  const ex = cx + r * Math.cos(rad(endDeg));
  const ey = cy + r * Math.sin(rad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

// A rotary control: press and drag around it and the pointer follows your mouse
// (drag further out for finer movement; hold Shift to turn it slowly).
// Double-click resets, arrow keys nudge.
export function Knob({ label, value, min, max, defaultValue, scale, unit, step, size = 40, color, onChange }: KnobProps) {
  const log = scale === 'log' && min > 0;
  const drag = useRef<KnobDrag | null>(null);
  const emit = (v: number) => {
    const snapped = step ? Math.round(v / step) * step : v;
    if (snapped !== value) onChange(Math.min(max, Math.max(min, snapped)));
  };
  const t = toNorm(value, min, max, log);
  const start = -SWEEP / 2;
  // Bipolar params (e.g. pan) draw their arc from the centre.
  const origin = min < 0 && max > 0 ? toNorm(0, min, max, false) : 0;
  const arcFrom = start + SWEEP * Math.min(origin, t);
  const arcTo = start + SWEEP * Math.max(origin, t);
  const r = size / 2 - 4;
  const c = size / 2;
  const angle = start + SWEEP * t;

  const follow = (d: KnobDrag, e: PointerEvent) => {
    const next = followPointer(d, e.clientX, e.clientY, e.shiftKey);
    if (next !== null) emit(fromNorm(next, min, max, log));
  };

  // A plain press snaps the knob to the pointer; a Shift-press grabs it where it is.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = startKnobDrag(e.currentTarget.getBoundingClientRect(), t);
    follow(drag.current, e);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) follow(drag.current, e);
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    // Stepped knobs move one step per press; continuous ones by 2% (0.2% with Shift).
    if (step) emit(value + delta * step);
    else emit(fromNorm(t + delta * (e.shiftKey ? 0.002 : 0.02), min, max, log));
  };

  return (
    <div className="knob nodrag" style={color ? { ['--knob-color' as string]: color } : undefined}>
      <div
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={formatValue(value, unit)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={onKeyDown}
        title={`${label}: ${formatValue(value, unit)}${unit === 'Hz' ? ' Hz' : ''} · drag around to turn, Shift for fine, double-click to reset`}
      >
        <svg width={size} height={size}>
          <path className="knob-track" d={arcPath(c, c, r, start, start + SWEEP)} />
          {arcTo - arcFrom > 0.5 && <path className="knob-value" d={arcPath(c, c, r, arcFrom, arcTo)} />}
          <line
            className="knob-pointer"
            x1={c}
            y1={c}
            x2={c + (r - 3) * Math.cos(((angle - 90) * Math.PI) / 180)}
            y2={c + (r - 3) * Math.sin(((angle - 90) * Math.PI) / 180)}
          />
        </svg>
      </div>
      <span className="knob-value-text">{formatValue(value, unit)}</span>
      <span className="knob-label">{label}</span>
    </div>
  );
}
