import { useMemo, useState } from 'react';
import { engine } from '../../audio/core/engineInstance';
import { getNodeDefinition } from '../../audio/core/nodeRegistry';
import type { ParamSpec } from '../../audio/core/types';
import { DrumMachineModule, VOICE_FIELDS, voiceKey, type VoiceField } from '../../audio/modules/drumMachine';
import { STEP_COUNT, TRACKS } from '../../audio/tracks';
import { useProjectStore, useTransportStore, type SynthNode } from '../../state/projectStore';
import { ParamControl, ParamPanel } from '../ParamControl';
import { StepGrid } from '../StepGrid';

const VOICE_SPECS: (ParamSpec & { key: VoiceField })[] = [
  { key: 'level', label: 'Level', kind: 'number', min: 0, max: 1.5, default: VOICE_FIELDS.level },
  { key: 'pan', label: 'Pan', kind: 'number', min: -1, max: 1, default: VOICE_FIELDS.pan },
  { key: 'drive', label: 'Drive', kind: 'number', min: 0, max: 1, default: VOICE_FIELDS.drive },
  {
    key: 'filterType',
    label: 'Filter',
    kind: 'select',
    options: [
      { value: 'lowpass', label: 'LP' },
      { value: 'highpass', label: 'HP' },
      { value: 'bandpass', label: 'BP' },
    ],
    default: VOICE_FIELDS.filterType,
  },
  { key: 'cutoff', label: 'Cutoff', kind: 'number', min: 20, max: 20000, default: VOICE_FIELDS.cutoff, unit: 'Hz', scale: 'log' },
  { key: 'resonance', label: 'Res', kind: 'number', min: 0, max: 20, default: VOICE_FIELDS.resonance },
  { key: 'reverb', label: 'Reverb', kind: 'number', min: 0, max: 1, default: VOICE_FIELDS.reverb },
  { key: 'delay', label: 'Delay', kind: 'number', min: 0, max: 1, default: VOICE_FIELDS.delay },
];

// The filter's neutral setting depends on its type: wide open for LP, closed for HP.
const NEUTRAL_CUTOFF: Record<string, number> = { lowpass: 20000, highpass: 20, bandpass: 1000 };

export function DrumMachineEditor({ node }: { node: SynthNode }) {
  const def = getNodeDefinition(node.type)!;
  const clip = useProjectStore((s) => s.clips[node.id]);
  const toggleDrumStep = useProjectStore((s) => s.toggleDrumStep);
  const clearClip = useProjectStore((s) => s.clearClip);
  const updateParams = useProjectStore((s) => s.updateParams);
  const currentStep = useTransportStore((s) => s.currentStep);
  const [selected, setSelected] = useState(TRACKS[0].id);
  const params = node.data.params;
  const track = TRACKS.find((t) => t.id === selected)!;

  const mutedTracks = useMemo(
    () => new Set(TRACKS.filter((t) => params[voiceKey(t.id, 'mute')] === true).map((t) => t.id)),
    [params],
  );

  const selectTrack = (trackId: string) => {
    setSelected(trackId);
    engine.getModule<DrumMachineModule>(node.id)?.trigger(trackId);
  };

  const setVoice = (field: VoiceField, value: number | string | boolean) => {
    const patch: Record<string, number | string | boolean> = { [voiceKey(selected, field)]: value };
    if (field === 'filterType' && typeof value === 'string') patch[voiceKey(selected, 'cutoff')] = NEUTRAL_CUTOFF[value];
    updateParams(node.id, patch);
  };

  const resetVoice = () => {
    const patch: Record<string, number | string | boolean> = {};
    for (const [field, value] of Object.entries(VOICE_FIELDS)) patch[voiceKey(selected, field as VoiceField)] = value;
    updateParams(node.id, patch);
  };

  const muted = mutedTracks.has(selected);

  return (
    <div className="drum-editor">
      <section className="editor-card">
        <div className="editor-card-header">
          <h3>Pattern</h3>
          <button type="button" className="ghost-button" onClick={() => clearClip(node.id)}>
            Clear
          </button>
        </div>
        {clip?.kind === 'drum' && (
          <StepGrid
            pattern={clip.pattern}
            currentStep={currentStep < 0 ? -1 : currentStep % STEP_COUNT}
            onToggleStep={(trackId, step) => toggleDrumStep(node.id, trackId, step)}
            selectedTrack={selected}
            mutedTracks={mutedTracks}
            onSelectTrack={selectTrack}
          />
        )}
      </section>

      <div className="drum-editor-side">
        <section className="editor-card voice-strip">
          <div className="editor-card-header">
            <h3>
              <span className="voice-tag">{track.shortName}</span> {track.name}
            </h3>
            <div className="editor-card-actions">
              <button
                type="button"
                className={`ghost-button ${muted ? 'on' : ''}`}
                aria-pressed={muted}
                onClick={() => setVoice('mute', !muted)}
              >
                Mute
              </button>
              <button type="button" className="ghost-button" onClick={() => selectTrack(selected)}>
                ▶ Audition
              </button>
              <button type="button" className="ghost-button" onClick={resetVoice}>
                Reset
              </button>
            </div>
          </div>
          <div className="param-panel">
            {VOICE_SPECS.map((spec) => (
              <ParamControl
                key={spec.key}
                spec={spec}
                value={params[voiceKey(selected, spec.key)]}
                onChange={(v) => setVoice(spec.key, v)}
                size={52}
                color={def.color}
              />
            ))}
          </div>
          <p className="editor-hint">
            Click a voice name to select and audition it. Reverb and Delay are sends into the kit's shared FX below.
          </p>
        </section>

        <section className="editor-card">
          <div className="editor-card-header">
            <h3>Kit FX &amp; Output</h3>
          </div>
          <ParamPanel
            specs={def.params}
            values={params}
            onChange={(key, value) => updateParams(node.id, { [key]: value })}
            size={48}
            color={def.color}
          />
        </section>
      </div>
    </div>
  );
}
