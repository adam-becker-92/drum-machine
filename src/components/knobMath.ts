// Rotary knob interaction, kept free of React so it can be tested on its own.

export const SWEEP = 270;
// Presses this close to the centre (as a fraction of the radius) don't jump the value.
const CENTRE_DEAD_ZONE = 0.35;
// Shift-drag turns the knob at this fraction of the pointer's rotation.
const FINE = 0.2;

export interface KnobDrag {
  cx: number;
  cy: number;
  deadZone: number;
  t: number; // current position on the sweep, 0..1
  lastDeg: number;
  tracking: boolean; // false until the pointer leaves the centre dead zone
}

export function startKnobDrag(rect: { left: number; top: number; width: number; height: number }, t: number): KnobDrag {
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    deadZone: (rect.width / 2) * CENTRE_DEAD_ZONE,
    t,
    lastDeg: 0,
    tracking: false,
  };
}

// Pointer angle around the knob centre: 0° straight up, clockwise positive, -180..180.
function pointerDegrees(d: KnobDrag, x: number, y: number): number {
  return (Math.atan2(x - d.cx, d.cy - y) * 180) / Math.PI;
}

// Where an angle sits on the 270° sweep; in the gap at the bottom, the end nearer the current value.
function degreesToNorm(deg: number, current: number): number {
  if (Math.abs(deg) > SWEEP / 2) return current >= 0.5 ? 1 : 0;
  return (deg + SWEEP / 2) / SWEEP;
}

// Moves the knob to follow the pointer and returns the new 0..1 position, or
// null if the pointer is still in the centre dead zone. A plain drag points the
// knob at the mouse; with Shift it turns by a fraction of the pointer's rotation.
export function followPointer(d: KnobDrag, x: number, y: number, fine: boolean): number | null {
  if (Math.hypot(x - d.cx, y - d.cy) < d.deadZone) return null;
  const deg = pointerDegrees(d, x, y);
  let next: number;
  if (fine) {
    const delta = d.tracking ? ((deg - d.lastDeg + 540) % 360) - 180 : 0; // first contact just grabs
    next = Math.min(1, Math.max(0, d.t + (delta / SWEEP) * FINE));
  } else {
    next = degreesToNorm(deg, d.t);
    // Never wrap through the gap at the bottom from one end to the other.
    if (d.tracking && Math.abs(next - d.t) > 0.5) next = d.t >= 0.5 ? 1 : 0;
  }
  d.tracking = true;
  d.lastDeg = deg;
  d.t = next;
  return next;
}
