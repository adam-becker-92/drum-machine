# Cheeky Synth

A modular groovebox in the browser. Sound sources and effects are boxes on a zoomable **Synth Graph** (in the spirit of Godot's visual shader editor): wire a source's **Out** into an effect's **In**, chain effects, and finish at the **Output**. Click ⤢ (or double-click) on any node to open its editor in a tab.

## Running locally

Uses [Bun](https://bun.sh) (Node/npm also work if installed).

```bash
bun install
bun run dev      # http://localhost:5173
bun run build    # type-check + production build
bun run lint     # oxlint
```

Space toggles play/stop. The project autosaves to `localStorage`; **New project** resets it.

## What's in it (Phase 1)

- **Drum Machine**: 11-voice 909-style step sequencer. Each voice has its own strip (level, pan, drive, LP/HP/BP filter, reverb send, delay send, mute), and the sends feed the kit's shared reverb and tempo-synced delay. Drop real samples into `public/samples/` (`bd.wav`, `sd.wav`, … see `src/audio/tracks.ts`) to replace the synthesized placeholders.
- **Effects**: Filter, Reverb, Delay, Distortion, Compressor.
- **Utility**: Gain/Pan and a 4-channel Mixer.
- **Output**: master volume, safety limiter and oscilloscope.

## Architecture

```
React Flow UI ──edits──▶ zustand project store ◀──subscribes── AudioEngine
 (graph, tabs,           (nodes, edges, params,                (one AudioModule per node;
  editors)                clips, bpm; persisted)                diffs edges → connect/disconnect)
                                                                       │
                                                         Transport (lookahead 16th-note clock)
                                                         → module.scheduleStep(step, time)
```

- `src/audio/core/nodeRegistry.ts` is the single list of node types. Each entry gives ports, param specs (which drive the knobs on the node and in the editor), default clip and an `AudioModule` factory.
- `src/audio/core/AudioEngine.ts` reconciles the store into live Web Audio nodes.
- `src/audio/core/Transport.ts` is the shared clock, so every sequenced module stays in sync.
- `src/audio/modules/` holds the DSP for each node type, built from raw Web Audio nodes.
- `src/state/projectStore.ts` holds the project data model and actions.

**Adding a node type:** write a class implementing `AudioModule` in `src/audio/modules/`, then add one entry to `NODE_DEFINITIONS`. The palette, graph node, inline knobs and the generic editor tab come for free. A node that needs a custom editor gets a branch in `src/components/editors/NodeEditor.tsx`.

## Roadmap

1. ~~Graph, tabs, drum machine with per-voice FX~~
2. Poly Synth, Bass Synth (303-style), FM Synth, Sampler, plus a piano roll and live computer-keyboard play
3. Web MIDI input and MIDI-learn, `.mid` import/export, clip library, project files, WAV export, share links
4. Later: modulation cables (LFO → any knob), an AudioWorklet expression node, subgraphs
