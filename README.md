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

Space toggles play/stop. **CLEAR** empties every pattern (your graph and sounds stay), **Reset** restores the starter patch, and both offer Undo. The project autosaves to `localStorage`; add `?project=name` to the URL to work on a separately saved project.

### Patching

- Drag from an **Out** port to an **In** port to connect. An input can take several cables, and they're summed.
- Drop an effect onto a cable to splice it in, either dragged from the palette or an unconnected node dragged from the canvas. The cable lights up first.
- Drag a cable off an input (or grab either end of it) and drop it on empty space to unplug it, or on another input to re-route it.
- Select and press Delete to remove nodes or cables.

Knobs are rotary: press and drag around one and it points at your mouse (drag further out for finer control, hold Shift to turn it slowly, double-click to reset).

### Playing

- Open an instrument's tab (or select it on the graph) and play it from your computer keyboard. **A**–**;** are the white keys and **W E T Y U O P** the black keys. **Z**/**X** shift the octave and **Shift** plays at full velocity. You can also click the on-screen keys.
- **● Rec** overdubs what you play into the clip, quantised to 16ths (it starts the transport if needed).
- In the piano roll, click to add a note (drag to set its length), drag to move, drag the right edge to resize, and double-click or right-click to delete. Drag in the **Vel** lane to set loudness. Clips can be 1, 2 or 4 bars long, and each loops on its own length.
- Each instrument has built-in presets, and **Save as…** keeps your own (stored in this browser).

## What's in it

- **Drum Machine**: 11-voice 909-style step sequencer. Each voice has its own strip (level, pan, drive, LP/HP/BP filter, reverb send, delay send, mute), and the sends feed the kit's shared reverb and tempo-synced delay. Drop real samples into `public/samples/` (`bd.wav`, `sd.wav`, … see `src/audio/tracks.ts`) to replace the synthesized placeholders.
- **Poly Synth** (Juno/Prophet-style): 8 voices, 2 oscillators + noise, resonant low-pass with its own envelope, amp envelope, LFO to pitch or cutoff.
- **Bass Synth** (TB-303-style): mono, 24 dB filter with env mod and decay. Notes at 80%+ velocity accent, and overlapping notes slide.
- **FM Synth** (DX7-style, 2 operators): ratio, index and a modulator envelope, with E.Piano, Bell, Pluck, Brass and Glass presets.
- **Sampler**: plays an audio file pitched across the keys (root note, start offset, loop, ADSR, filter). Comes with built-in Pluck/Keys/Pad sounds. Files you load are kept in this browser's IndexedDB.
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
- `src/audio/modules/` holds the DSP for each node type, built from raw Web Audio nodes. Instruments extend `NoteInstrument` (`instrument.ts`), which plays a note clip off the Transport and takes live `noteOn`/`noteOff`.
- `src/state/projectStore.ts` holds the project data model and actions. `src/state/liveInput.ts` routes live notes (keys now, MIDI next) and handles recording.

**Adding a node type:** write a class implementing `AudioModule` in `src/audio/modules/`, then add one entry to `NODE_DEFINITIONS`. The palette, graph node, inline knobs and the generic editor tab come for free. A node that needs a custom editor gets a branch in `src/components/editors/NodeEditor.tsx`.

## Roadmap

1. ~~Graph, tabs, drum machine with per-voice FX~~
2. ~~Poly Synth, Bass Synth (303-style), FM Synth, Sampler, plus a piano roll and live computer-keyboard play~~
3. Web MIDI input and MIDI-learn, `.mid` import/export, clip library, project files, WAV export, share links
4. Later: modulation cables (LFO → any knob), an AudioWorklet expression node, subgraphs
