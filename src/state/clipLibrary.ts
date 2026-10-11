import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Clip } from '../audio/core/types';

// Named drum patterns and melodies kept in this browser, for reuse in any
// project or instrument (and for sharing as links).
export interface LibraryClip {
  id: string;
  name: string;
  clip: Clip;
  savedAt: number;
}

interface ClipLibraryState {
  clips: LibraryClip[];
  saveClip: (name: string, clip: Clip) => LibraryClip;
  deleteClip: (id: string) => void;
}

export const useClipLibrary = create<ClipLibraryState>()(
  persist(
    (set) => ({
      clips: [],
      saveClip: (name, clip) => {
        const entry: LibraryClip = { id: crypto.randomUUID().slice(0, 10), name, clip, savedAt: Date.now() };
        set((state) => ({ clips: [entry, ...state.clips] }));
        return entry;
      },
      deleteClip: (id) => set((state) => ({ clips: state.clips.filter((c) => c.id !== id) })),
    }),
    { name: 'cheeky-synth.clips', partialize: (state) => ({ clips: state.clips }) },
  ),
);
