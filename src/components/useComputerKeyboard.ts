import { useEffect } from 'react';
import { pressNote, releaseAllNotes, releaseNote, useLiveStore, DEFAULT_VELOCITY } from '../state/liveInput';

// "Musical typing" layout by physical key position (KeyboardEvent.code), so it
// works on any keyboard layout: the home row is the white keys from C.
const KEY_OFFSETS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9,
  KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

// Semitone offset from the typing octave's C -> label, for on-screen hints.
export const COMPUTER_KEY_LABELS: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_OFFSETS).map(([code, offset]) => [offset, code === 'Semicolon' ? ';' : code === 'Quote' ? "'" : code.slice(3)]),
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
    // Remember which pitch each physical key started, so changing octave
    // mid-hold still releases the right note.
    const down = new Map<string, number>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const { octave } = useLiveStore.getState();
      if (e.code === 'KeyZ' || e.code === 'KeyX') {
        const next = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, octave + (e.code === 'KeyX' ? 1 : -1)));
        useLiveStore.setState({ octave: next });
        return;
      }
      const offset = KEY_OFFSETS[e.code];
      if (offset === undefined || down.has(e.code)) return;
      const pitch = (octave + 1) * 12 + offset;
      down.set(e.code, pitch);
      pressNote(pitch, e.shiftKey ? 1 : DEFAULT_VELOCITY);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const pitch = down.get(e.code);
      if (pitch === undefined) return;
      down.delete(e.code);
      releaseNote(pitch);
    };

    const onBlur = () => {
      down.clear();
      releaseAllNotes();
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
