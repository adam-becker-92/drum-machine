import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  scale?: 'linear' | 'log';
  unit?: string;
  size?: number;
  color?: string;
  onChange: (value: number) => void;
}

const SWEEP = 270;
const DRAG_PIXELS = 180;

function toNorm(value: number, min: number, max: number, log: boolean): number {
  const t = log ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min);
  return Math.min(1, Math.max(0, t));
}

function fromNorm(t: number, min: number, max: number, log: boolean): number {
  const c = Math.min(1, Math.max(0, t));
  return log ? min * Math.pow(max / min, c) : min + c * (max - min);
}

function formatValue(value: number, unit?: string): string {
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

// Drag up/down to turn (hold Shift for fine control), double-click to reset.
export function Knob({ label, value, min, max, defaultValue, scale, unit, size = 40, color, onChange }: KnobProps) {
  const log = scale === 'log' && min > 0;
  const drag = useRef<{ y: number; t: number; fine: boolean } | null>(null);
  const t = toNorm(value, min, max, log);
  const start = -SWEEP / 2;
  // Bipolar params (e.g. pan) draw their arc from the centre.
  const origin = min < 0 && max > 0 ? toNorm(0, min, max, false) : 0;
  const arcFrom = start + SWEEP * Math.min(origin, t);
  const arcTo = start + SWEEP * Math.max(origin, t);
  const r = size / 2 - 4;
  const c = size / 2;
  const angle = start + SWEEP * t;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, t, fine: e.shiftKey };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const pixels = e.shiftKey ? DRAG_PIXELS * 5 : DRAG_PIXELS;
    const next = drag.current.t + (drag.current.y - e.clientY) / pixels;
    onChange(fromNorm(next, min, max, log));
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    onChange(fromNorm(t + delta * (e.shiftKey ? 0.002 : 0.02), min, max, log));
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
        title={`${label}: ${formatValue(value, unit)}${unit === 'Hz' ? ' Hz' : ''} (double-click to reset)`}
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
