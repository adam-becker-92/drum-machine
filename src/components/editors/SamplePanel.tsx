import { useEffect, useRef, useState, type DragEvent } from 'react';
import { engine } from '../../audio/core/engineInstance';
import { num, str } from '../../audio/dsp';
import { BUILT_IN_SAMPLES, isBuiltInSample, loadSampleBuffer } from '../../audio/sampleLibrary';
import { importAudioFile } from '../../io/files';
import { listSamples, type SampleListing } from '../../io/sampleStore';
import { useProjectStore, type SynthNode } from '../../state/projectStore';

const WAVE_W = 560;
const WAVE_H = 90;

function Waveform({ buffer, start, loop, color }: { buffer: AudioBuffer | null; start: number; loop: boolean; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WAVE_W * dpr;
    canvas.height = WAVE_H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, WAVE_W, WAVE_H);
    if (!buffer) return;
    const data = buffer.getChannelData(0);
    const perPixel = Math.max(1, Math.floor(data.length / WAVE_W));
    const startX = start * WAVE_W;
    if (loop) {
      g.fillStyle = 'rgba(255, 255, 255, 0.05)';
      g.fillRect(startX, 0, WAVE_W - startX, WAVE_H);
    }
    g.fillStyle = color;
    for (let x = 0; x < WAVE_W; x++) {
      let min = 1;
      let max = -1;
      for (let i = x * perPixel; i < (x + 1) * perPixel && i < data.length; i++) {
        min = Math.min(min, data[i]);
        max = Math.max(max, data[i]);
      }
      g.globalAlpha = x < startX ? 0.3 : 1;
      g.fillRect(x, ((1 - max) / 2) * WAVE_H, 1, Math.max(1, ((max - min) / 2) * WAVE_H));
    }
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    g.fillRect(startX, 0, 1.5, WAVE_H);
  }, [buffer, start, loop, color]);

  return <canvas ref={canvasRef} className="sample-wave" style={{ width: WAVE_W, height: WAVE_H }} />;
}

// Choose a built-in sound or load your own file (kept in this browser's IndexedDB).
export function SamplePanel({ node, color }: { node: SynthNode; color: string }) {
  const updateParams = useProjectStore((s) => s.updateParams);
  const params = node.data.params;
  const sampleId = str(params.sampleId, BUILT_IN_SAMPLES[0].id);
  const [userSamples, setUserSamples] = useState<SampleListing[]>([]);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listSamples().then(setUserSamples, () => setUserSamples([]));
  }, []);

  useEffect(() => {
    let current = true;
    loadSampleBuffer(engine.ctx, sampleId).then((b) => current && setBuffer(b));
    return () => {
      current = false;
    };
  }, [sampleId]);

  const choose = (id: string) => {
    const builtIn = BUILT_IN_SAMPLES.find((s) => s.id === id);
    const user = userSamples.find((s) => s.id === id);
    updateParams(node.id, {
      sampleId: id,
      sampleName: builtIn?.name ?? user?.name ?? id,
      ...(builtIn ? { root: builtIn.root } : {}),
      _preset: '',
    });
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { id, name } = await importAudioFile(file, engine.ctx);
      setUserSamples(await listSamples());
      updateParams(node.id, { sampleId: id, sampleName: name, root: 60, _preset: '' });
    } catch {
      setError(`Couldn't read "${file.name}" as audio. Try a WAV, MP3, OGG or FLAC file.`);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void loadFile(e.dataTransfer.files[0]);
  };

  return (
    <section
      className={`editor-card sample-panel ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="editor-card-header">
        <h3>Sample</h3>
        <select value={sampleId} onChange={(e) => choose(e.target.value)} aria-label="Sample">
          <optgroup label="Built-in">
            {BUILT_IN_SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
          {userSamples.length > 0 && (
            <optgroup label="Your samples">
              {userSamples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
          {!isBuiltInSample(sampleId) && !userSamples.some((s) => s.id === sampleId) && (
            <option value={sampleId}>{str(params.sampleName, 'Missing sample')}</option>
          )}
        </select>
        <button type="button" className="ghost-button" onClick={() => fileRef.current?.click()}>
          Load file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            void loadFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      <Waveform buffer={buffer} start={num(params.start, 0)} loop={params.loop === true} color={color} />
      <p className="editor-hint">
        {error ??
          (buffer
            ? `${buffer.duration.toFixed(2)}s · plays at natural speed on the Root note. Drop an audio file here to load your own.`
            : 'Sample not available in this browser. Load the file again, or pick another.')}
      </p>
    </section>
  );
}
