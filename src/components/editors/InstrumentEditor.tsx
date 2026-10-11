import { useState } from 'react';
import { CLIP_LENGTHS } from '../../audio/clips';
import { engine } from '../../audio/core/engineInstance';
import { defaultParams, getNodeDefinition } from '../../audio/core/nodeRegistry';
import type { NodeDefinition, Params } from '../../audio/core/types';
import { str } from '../../audio/dsp';
import { useLiveStore } from '../../state/liveInput';
import { usePresetStore } from '../../state/presetStore';
import { useProjectStore, useTransportStore, type SynthNode } from '../../state/projectStore';
import { KeyboardStrip } from '../KeyboardStrip';
import { ParamGroups } from '../ParamControl';
import { PianoRoll } from '../PianoRoll';
import { SamplePanel } from './SamplePanel';

const NO_PRESET: never[] = [];

function PresetBar({ node, def }: { node: SynthNode; def: NodeDefinition }) {
  const updateParams = useProjectStore((s) => s.updateParams);
  const userPresets = usePresetStore((s) => s.presets[def.type] ?? NO_PRESET);
  const savePreset = usePresetStore((s) => s.savePreset);
  const deletePreset = usePresetStore((s) => s.deletePreset);
  const [naming, setNaming] = useState<string | null>(null);
  const current = str(node.data.params._preset, '');

  const load = (value: string) => {
    const [source, name] = [value.slice(0, 2), value.slice(2)];
    const preset = (source === 'b:' ? def.presets ?? [] : userPresets).find((p) => p.name === name);
    if (!preset) return;
    // Presets start from the defaults so nothing from the previous sound lingers.
    updateParams(node.id, { ...defaultParams(def), ...preset.params, _preset: value });
  };

  const save = () => {
    const name = naming?.trim();
    if (!name) return;
    const { _preset: _ignored, ...params } = node.data.params;
    savePreset(def.type, { name, params: params as Params });
    updateParams(node.id, { _preset: `u:${name}` });
    setNaming(null);
  };

  return (
    <div className="preset-bar">
      <label className="preset-label" htmlFor={`preset-${node.id}`}>
        Preset
      </label>
      <select id={`preset-${node.id}`} value={current} onChange={(e) => load(e.target.value)}>
        <option value="">— choose —</option>
        <optgroup label="Built-in">
          {(def.presets ?? []).map((p) => (
            <option key={p.name} value={`b:${p.name}`}>
              {p.name}
            </option>
          ))}
        </optgroup>
        {userPresets.length > 0 && (
          <optgroup label="Yours">
            {userPresets.map((p) => (
              <option key={p.name} value={`u:${p.name}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {naming === null ? (
        <>
          <button type="button" className="ghost-button" onClick={() => setNaming(current.slice(2))}>
            Save as…
          </button>
          {current.startsWith('u:') && (
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                deletePreset(def.type, current.slice(2));
                updateParams(node.id, { _preset: '' });
              }}
            >
              Delete preset
            </button>
          )}
        </>
      ) : (
        <form
          className="preset-save"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            autoFocus
            value={naming}
            placeholder="Preset name"
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}
            aria-label="Preset name"
          />
          <button type="submit" className="ghost-button" disabled={!naming.trim()}>
            Save
          </button>
          <button type="button" className="ghost-button" onClick={() => setNaming(null)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

export function InstrumentEditor({ node }: { node: SynthNode }) {
  const def = getNodeDefinition(node.type)!;
  const clip = useProjectStore((s) => s.clips[node.id]);
  const updateParams = useProjectStore((s) => s.updateParams);
  const setClipLength = useProjectStore((s) => s.setClipLength);
  const clearClip = useProjectStore((s) => s.clearClip);
  const recordArmed = useLiveStore((s) => s.recordArmed);
  const isPlaying = useTransportStore((s) => s.isPlaying);

  const toggleRecord = () => {
    const armed = !recordArmed;
    useLiveStore.setState({ recordArmed: armed });
    if (armed && !isPlaying) void engine.play();
  };

  return (
    <div className="instrument-editor">
      <PresetBar node={node} def={def} />

      {node.type === 'sampler' && <SamplePanel node={node} color={def.color} />}

      <section className="editor-card">
        <ParamGroups
          specs={def.params}
          values={node.data.params}
          onChange={(key, value) => updateParams(node.id, { [key]: value })}
          size={46}
          color={def.color}
        />
      </section>

      {clip?.kind === 'notes' && (
        <section className="editor-card">
          <div className="editor-card-header">
            <h3>Clip</h3>
            <div className="segmented" role="radiogroup" aria-label="Clip length">
              {CLIP_LENGTHS.map((length) => (
                <button
                  key={length}
                  type="button"
                  role="radio"
                  aria-checked={clip.length === length}
                  className={clip.length === length ? 'on' : ''}
                  onClick={() => setClipLength(node.id, length)}
                >
                  {length / 16} bar{length > 16 ? 's' : ''}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`ghost-button rec-button ${recordArmed ? 'armed' : ''}`}
              aria-pressed={recordArmed}
              onClick={toggleRecord}
              title="Record what you play into this clip (overdub)"
            >
              ● Rec
            </button>
            <button type="button" className="ghost-button" onClick={() => clearClip(node.id)}>
              Clear
            </button>
          </div>
          <PianoRoll nodeId={node.id} clip={clip} color={def.color} />
          <p className="editor-hint">
            Click to add a note (drag to set its length), drag to move, drag its right edge to resize, double-click or
            right-click to delete. Drag in the Vel lane to set loudness.
            {node.type === 'bassSynth' && ' Notes at 80%+ velocity are accented; overlap two notes to slide between them.'}
          </p>
        </section>
      )}

      <section className="editor-card">
        <KeyboardStrip nodeId={node.id} color={def.color} />
      </section>
    </div>
  );
}
