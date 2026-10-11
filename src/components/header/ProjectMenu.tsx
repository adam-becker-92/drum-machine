import { useCallback, useState } from 'react';
import { engine } from '../../audio/core/engineInstance';
import { getNodeDefinition } from '../../audio/core/nodeRegistry';
import { copyLink, downloadBlob, pickFile, safeFileName } from '../../io/files';
import { clipsToMidi } from '../../io/midiFile';
import { parseProject, serializeProject } from '../../io/projectFile';
import { projectShareUrl } from '../../io/shareLink';
import { encodeWav, renderProject, renderSeconds } from '../../io/wavExport';
import { pickProjectData, useProjectStore, type ProjectData } from '../../state/projectStore';
import { showToast } from '../../state/toastStore';
import { ContextMenu, type MenuEntry } from '../ContextMenu';
import { Modal } from '../Modal';

const BAR_CHOICES = [1, 2, 4, 8, 16];

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function ShareDialog({ onClose }: { onClose: () => void }) {
  const [url] = useState(() => projectShareUrl(pickProjectData(useProjectStore.getState())));
  const usesOwnSamples = useProjectStore((s) =>
    s.nodes.some((n) => Object.entries(n.data.params).some(([k, v]) => /(^|\.)sample(Id)?$/.test(k) && typeof v === 'string' && v.startsWith('user:'))),
  );
  return (
    <Modal title="Share project" onClose={onClose}>
      <p className="dialog-note">
        The whole project is packed into this link; nothing is uploaded. It opens as a separate copy, so whoever opens it
        won't overwrite their own work.
      </p>
      <div className="dialog-row">
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Share link" />
        <button type="button" className="ghost-button" onClick={() => void copyLink(url, 'Project')}>
          Copy
        </button>
      </div>
      {usesOwnSamples && (
        <p className="dialog-note warn">
          Samples you loaded yourself stay in this browser and aren't in the link; those voices fall back to their
          built-in sounds for others.
        </p>
      )}
    </Modal>
  );
}

function ExportAudioDialog({ onClose }: { onClose: () => void }) {
  const bpm = useProjectStore((s) => s.bpm);
  const hasOutput = useProjectStore((s) => s.nodes.some((n) => n.type === 'master'));
  const [bars, setBars] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const render = async () => {
    setBusy(true);
    setError(null);
    try {
      const project = pickProjectData(useProjectStore.getState());
      const buffer = await renderProject(project, bars, engine.ctx.sampleRate);
      downloadBlob(encodeWav(buffer), `cheeky-synth-${bpm}bpm-${bars}bar${bars > 1 ? 's' : ''}-${dateStamp()}.wav`);
      showToast(`Exported ${bars} bar${bars > 1 ? 's' : ''} as WAV.`);
      onClose();
    } catch {
      setError('Rendering failed. Try fewer bars?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Export audio" onClose={onClose}>
      <p className="dialog-note">
        Renders exactly what the Output hears (every clip looping, effects and all) to a 16-bit WAV, faster than real
        time.
      </p>
      <div className="dialog-row">
        <label className="dialog-label" htmlFor="export-bars">
          Length
        </label>
        <select id="export-bars" value={bars} onChange={(e) => setBars(Number(e.target.value))}>
          {BAR_CHOICES.map((b) => (
            <option key={b} value={b}>
              {b} bar{b > 1 ? 's' : ''}
            </option>
          ))}
        </select>
        <span className="dialog-list-info">≈ {renderSeconds({ bpm }, bars).toFixed(1)}s incl. tail</span>
      </div>
      {!hasOutput && <p className="dialog-note warn">There's no Output node, so the render would be silent.</p>}
      {error && <p className="dialog-note warn">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="ghost-button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="ghost-button primary" disabled={busy || !hasOutput} onClick={() => void render()}>
          {busy ? 'Rendering…' : 'Render WAV'}
        </button>
      </div>
    </Modal>
  );
}

interface ProjectMenuProps {
  // Swaps in a whole project, offering Undo.
  onReplaceProject: (message: string, data: ProjectData) => void;
}

export function ProjectMenu({ onReplaceProject }: ProjectMenuProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<'share' | 'audio' | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const exportProject = () => {
    const blob = new Blob([serializeProject(pickProjectData(useProjectStore.getState()))], { type: 'application/json' });
    downloadBlob(blob, `cheeky-synth-project-${dateStamp()}.json`);
  };

  const importProject = async () => {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const project = parseProject(JSON.parse(await file.text()));
      if (!project) throw new Error('not a project');
      onReplaceProject(`Opened “${file.name}”.`, project);
    } catch {
      showToast(`“${file.name}” isn't a Cheeky Synth project file.`);
    }
  };

  const exportAllMidi = () => {
    const { nodes, clips, bpm } = useProjectStore.getState();
    const tracks = nodes.flatMap((n) => (clips[n.id] && getNodeDefinition(n.type)?.createClip ? [{ name: n.data.name, clip: clips[n.id] }] : []));
    if (tracks.length === 0) {
      showToast('Nothing to export: add a drum machine or an instrument first.');
      return;
    }
    const bytes = clipsToMidi(tracks, bpm);
    downloadBlob(new Blob([bytes.slice()], { type: 'audio/midi' }), `${safeFileName('cheeky synth')}-${dateStamp()}.mid`);
  };

  const entries: MenuEntry[] = [
    { label: 'Share link…', onSelect: () => setDialog('share') },
    'separator',
    { label: 'Export project (.json)', onSelect: exportProject },
    { label: 'Import project…', onSelect: () => void importProject() },
    'separator',
    { label: 'Export MIDI (all clips)', onSelect: exportAllMidi },
    { label: 'Export audio (WAV)…', onSelect: () => setDialog('audio') },
  ];

  return (
    <>
      <button
        type="button"
        className="ghost-button"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.left, y: rect.bottom + 6 });
        }}
      >
        Project ▾
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={closeMenu} />}
      {dialog === 'share' && <ShareDialog onClose={closeDialog} />}
      {dialog === 'audio' && <ExportAudioDialog onClose={closeDialog} />}
    </>
  );
}
