import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Preset } from '../audio/core/types';

interface PresetState {
  // User presets per node type.
  presets: Record<string, Preset[]>;
  savePreset: (type: string, preset: Preset) => void;
  deletePreset: (type: string, name: string) => void;
}

export const usePresetStore = create<PresetState>()(
  persist(
    (set) => ({
      presets: {},
      savePreset: (type, preset) =>
        set((state) => ({
          presets: {
            ...state.presets,
            [type]: [...(state.presets[type] ?? []).filter((p) => p.name !== preset.name), preset],
          },
        })),
      deletePreset: (type, name) =>
        set((state) => ({
          presets: { ...state.presets, [type]: (state.presets[type] ?? []).filter((p) => p.name !== name) },
        })),
    }),
    { name: 'cheeky-synth.presets', partialize: (state) => ({ presets: state.presets }) },
  ),
);
