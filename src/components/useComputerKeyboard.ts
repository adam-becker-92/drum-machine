import { useEffect } from 'react';
import { GM_DRUM_NOTES } from '../audio/tracks';
import { DEFAULT_VELOCITY, liveTarget, pressNote, releaseNote, releaseSource, useLiveStore } from '../state/liveInput';
import { useProjectStore } from '../state/projectStore';

// "Musical typing" layout by physical key position (KeyboardEvent.code), so it
// works on any keyboard layout: the home row is the white keys from C.
const KEY_OFFSETS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9,
  KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

// On a drum machine the home row plays the kit, one voice per key.
export const DRUM_KEYS: Record<string, string> = {
  KeyA: 'bd', KeyS: 'sd', KeyD: 'lt', KeyF: 'mt', KeyG: 'ht', KeyH: 'rs',
  KeyJ: 'cp', KeyK: 'ch', KeyL: 'oh', Semicolon: 'cr', Quote: 'rd',
};

const keyLabel = (code: string) => (code === 'Semicolon' ? ';' : code === 'Quote' ? "'" : code.slice(3));

// Semitone offset from the typing octave's C -> label, for on-screen hints.
export const COMPUTER_KEY_LABELS: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_OFFSETS).map(([code, offset]) => [offset, keyLabel(code)]),
);

// Drum voice -> key label, for the drum editor's hints.
export const DRUM_KEY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(DRUM_KEYS).map(([code, track]) => [track, keyLabel(code)]),
);

const MIN_OCTAVE = 1;
const MAX_OCTAVE = 7;

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function useComputerKeyboard() {
  useEffect(() => {
    // Remember what each physical key started, so changing octave or tab
    // mid-hold still releases the right note.
    const down = new Map<string, { pitch: number; target: string }>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const { octave } = useLiveStore.getState();
      if (e.code === 'KeyZ' || e.code === 'KeyX') {
        const next = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, octave + (e.code === 'KeyX' ? 1 : -1)));
        useLiveStore.setState({ octave: next });
        return;
      }
      if (down.has(e.code)) return;
      const target = liveTarget();
      if (!target) return;
      const isDrums = useProjectStore.getState().nodes.find((n) => n.id === target)?.type === 'drumMachine';
      const pitch = isDrums
        ? GM_DRUM_NOTES[DRUM_KEYS[e.code]]
        : KEY_OFFSETS[e.code] === undefined
          ? undefined
          : (octave + 1) * 12 + KEY_OFFSETS[e.code];
      if (pitch === undefined) return;
      down.set(e.code, { pitch, target });
      pressNote(pitch, e.shiftKey ? 1 : DEFAULT_VELOCITY, target, 'keys');
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const held = down.get(e.code);
      if (!held) return;
      down.delete(e.code);
      releaseNote(held.pitch, held.target, 'keys');
    };

    const onBlur = () => {
      down.clear();
      releaseSource('keys');
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
  }, []);
}
