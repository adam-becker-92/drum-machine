import { useMemo, useState, type DragEvent } from 'react';
import { engine } from '../../audio/core/engineInstance';
import { getNodeDefinition } from '../../audio/core/nodeRegistry';
import { str } from '../../audio/dsp';
import { DrumMachineModule, VOICE_FIELDS, VOICE_SPECS, voiceKey, type VoiceField } from '../../audio/modules/drumMachine';
import { STEP_COUNT, TRACKS } from '../../audio/tracks';
import { importAudioFile, pickFile } from '../../io/files';
import { useProjectStore, useTransportStore, type SynthNode } from '../../state/projectStore';
import { showToast } from '../../state/toastStore';
import { ParamControl, ParamPanel } from '../ParamControl';
import { StepGrid } from '../StepGrid';
import { DRUM_KEY_LABELS } from '../useComputerKeyboard';
import { ClipTools, RecButton } from './ClipTools';

// The filter's neutral setting depends on its type: wide open for LP, closed for HP.
const NEUTRAL_CUTOFF: Record<string, number> = { lowpass: 20000, highpass: 20, bandpass: 1000 };

const hasAudioFile = (e: DragEvent) => e.dataTransfer.types.includes('Files');

export function DrumMachineEditor({ node }: { node: SynthNode }) {
  const def = getNodeDefinition(node.type)!;
  const clip = useProjectStore((s) => s.clips[node.id]);
  const toggleDrumStep = useProjectStore((s) => s.toggleDrumStep);
  const clearClip = useProjectStore((s) => s.clearClip);
  const updateParams = useProjectStore((s) => s.updateParams);
  const currentStep = useTransportStore((s) => s.currentStep);
  const [selected, setSelected] = useState(TRACKS[0].id);
  const [dropOnStrip, setDropOnStrip] = useState(false);
  const params = node.data.params;
  const track = TRACKS.find((t) => t.id === selected)!;
  const sampleName = str(params[voiceKey(selected, 'sampleName')], '');

  const mutedTracks = useMemo(
    () => new Set(TRACKS.filter((t) => params[voiceKey(t.id, 'mute')] === true).map((t) => t.id)),
    [params],
  );

  const audition = (trackId: string) => engine.getModule<DrumMachineModule>(node.id)?.trigger(trackId);

  const selectTrack = (trackId: string) => {
    setSelected(trackId);
    audition(trackId);
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

  // Replace a voice's sound with a file of your own (kept in this browser).
  const loadVoiceSample = async (trackId: string, file: File | null | undefined) => {
    if (!file) return;
    try {
      const { id, name } = await importAudioFile(file, engine.ctx);
      updateParams(node.id, { [voiceKey(trackId, 'sample')]: id, [voiceKey(trackId, 'sampleName')]: name });
      setSelected(trackId);
      showToast(`${TRACKS.find((t) => t.id === trackId)?.name} now plays “${name}”.`);
      window.setTimeout(() => audition(trackId), 150);
    } catch {
      showToast(`Couldn't read “${file.name}” as audio. Try a WAV, MP3, OGG or FLAC file.`);
    }
  };

  const muted = mutedTracks.has(selected);

  return (
    <div className="drum-editor">
      <section className="editor-card">
        <div className="editor-card-header">
          <h3>Pattern</h3>
          <RecButton />
          <ClipTools node={node} />
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
            keyHints={DRUM_KEY_LABELS}
            onDropFile={(trackId, file) => void loadVoiceSample(trackId, file)}
          />
        )}
        <p className="editor-hint">
          Finger-drum from your computer keyboard: the keys shown on each row (A S D F G H J K L ; ') play the kit, and
          with ● Rec on they're written into the pattern. MIDI pads work too (General MIDI drum notes). Drop an audio
          file on a row to use your own sound for it.
        </p>
      </section>

      <div className="drum-editor-side">
        <section
          className={`editor-card voice-strip ${dropOnStrip ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            if (!hasAudioFile(e)) return;
            e.preventDefault();
            setDropOnStrip(true);
          }}
          onDragLeave={() => setDropOnStrip(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropOnStrip(false);
            void loadVoiceSample(selected, e.dataTransfer.files[0]);
          }}
        >
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
              <button type="button" className="ghost-button" onClick={() => audition(selected)}>
                ▶ Audition
              </button>
              <button type="button" className="ghost-button" onClick={resetVoice}>
                Reset
              </button>
            </div>
          </div>
          <div className="voice-sample">
            <span className="voice-sample-label">Sound</span>
            <span className="voice-sample-name" title={sampleName || undefined}>
              {sampleName || 'Built-in 909'}
            </span>
            <button
              type="button"
              className="ghost-button"
              onClick={async () => void loadVoiceSample(selected, await pickFile('audio/*'))}
            >
              Load file…
            </button>
            {sampleName && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => updateParams(node.id, { [voiceKey(selected, 'sample')]: '', [voiceKey(selected, 'sampleName')]: '' })}
              >
                Use built-in
              </button>
            )}
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
                nodeId={node.id}
                paramKey={voiceKey(selected, spec.key)}
              />
            ))}
          </div>
          <p className="editor-hint">
            Click a voice name to select and audition it. Reverb and Delay are sends into the kit's shared FX below.
            Right-click a knob to MIDI-learn it.
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
            nodeId={node.id}
          />
        </section>
      </div>
    </div>
  );
}
