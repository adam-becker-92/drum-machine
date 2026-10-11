import { useCallback, useState } from 'react';
import { describeClip } from '../../audio/clips';
import { engine } from '../../audio/core/engineInstance';
import type { Clip } from '../../audio/core/types';
import { copyLink, downloadBlob, pickFile, safeFileName } from '../../io/files';
import { clipsToMidi, midiTrackToDrumClip, midiTrackToNoteClip, readMidi, type ParsedMidi } from '../../io/midiFile';
import { clipShareUrl } from '../../io/shareLink';
import { useClipLibrary, type LibraryClip } from '../../state/clipLibrary';
import { useLiveStore } from '../../state/liveInput';
import { useProjectStore, useTransportStore, type SynthNode } from '../../state/projectStore';
import { showToast } from '../../state/toastStore';
import { ContextMenu, type MenuEntry } from '../ContextMenu';
import { Modal } from '../Modal';

// Arms recording; starts the transport so there's something to record over.
export function RecButton() {
  const recordArmed = useLiveStore((s) => s.recordArmed);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  return (
    <button
      type="button"
      className={`ghost-button rec-button ${recordArmed ? 'armed' : ''}`}
      aria-pressed={recordArmed}
      onClick={() => {
        useLiveStore.setState({ recordArmed: !recordArmed });
        if (!recordArmed && !isPlaying) void engine.play();
      }}
      title="Record what you play (keys, mouse or MIDI) into this clip, overdubbing"
    >
      ● Rec
    </button>
  );
}

function replaceWithUndo(nodeId: string, next: Clip, message: string) {
  const { clips, replaceClip } = useProjectStore.getState();
  const previous = clips[nodeId];
  if (!replaceClip(nodeId, next)) {
    showToast("That clip doesn't fit this instrument (drum patterns go on drum machines, melodies on instruments).");
    return;
  }
  showToast(message, previous ? { label: 'Undo', run: () => useProjectStore.getState().replaceClip(nodeId, previous) } : undefined);
}

function LibraryDialog({ node, clip, onClose }: { node: SynthNode; clip: Clip; onClose: () => void }) {
  const library = useClipLibrary((s) => s.clips);
  const saveClip = useClipLibrary((s) => s.saveClip);
  const deleteClip = useClipLibrary((s) => s.deleteClip);
  const [name, setName] = useState(`${node.data.name} clip`);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const matching = library.filter((c) => c.clip.kind === clip.kind);

  const share = async (entry: LibraryClip) => {
    const url = clipShareUrl({ name: entry.name, clip: entry.clip });
    if (!(await copyLink(url, `“${entry.name}”`))) setShareUrl(url);
  };

  return (
    <Modal title="Clip library" onClose={onClose}>
      <form
        className="dialog-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          saveClip(name.trim(), clip);
          showToast(`Saved “${name.trim()}” to your clip library.`);
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Clip name" />
        <button type="submit" className="ghost-button" disabled={!name.trim()}>
          Save this clip
        </button>
      </form>
      {shareUrl && (
        <div className="dialog-row">
          <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Share link" />
        </div>
      )}
      {matching.length === 0 ? (
        <p className="dialog-note">
          No saved {clip.kind === 'drum' ? 'drum patterns' : 'melodies'} yet. Saved clips can be loaded into any{' '}
          {clip.kind === 'drum' ? 'drum machine' : 'instrument'}, in any project.
        </p>
      ) : (
        <ul className="dialog-list">
          {matching.map((entry) => (
            <li key={entry.id}>
              <span className="dialog-list-name">{entry.name}</span>
              <span className="dialog-list-info">{describeClip(entry.clip)}</span>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  replaceWithUndo(node.id, entry.clip, `Loaded “${entry.name}”.`);
                  onClose();
                }}
              >
                Load
              </button>
              <button type="button" className="ghost-button" onClick={() => void share(entry)}>
                Share
              </button>
              <button type="button" className="ghost-button" onClick={() => deleteClip(entry.id)} aria-label={`Delete ${entry.name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function TrackPickerDialog({
  parsed,
  drums,
  onPick,
  onClose,
}: {
  parsed: ParsedMidi;
  drums: boolean;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Which track?" onClose={onClose}>
      <p className="dialog-note">This file has several tracks. Pick one to bring into the {drums ? 'drum pattern' : 'piano roll'}.</p>
      <ul className="dialog-list">
        {parsed.tracks.map((t) => (
          <li key={t.index}>
            <span className="dialog-list-name">{t.name}</span>
            <span className="dialog-list-info">
              {t.noteCount} notes{t.percussion ? ' · drums' : ''}
            </span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                onPick(t.index);
                onClose();
              }}
            >
              Import
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// "Clip ▾" menu: library, .mid import/export, share link.
export function ClipTools({ node }: { node: SynthNode }) {
  const clip = useProjectStore((s) => s.clips[node.id]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'library' } | { kind: 'tracks'; parsed: ParsedMidi } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  if (!clip) return null;
  const drums = clip.kind === 'drum';

  const importTrack = (parsed: ParsedMidi, index: number) => {
    const result = drums ? midiTrackToDrumClip(parsed, index) : midiTrackToNoteClip(parsed, index);
    const track = parsed.tracks.find((t) => t.index === index)?.name ?? 'the file';
    const skipped = result.skipped ? ` (${result.skipped} skipped${drums ? ': past bar 1 or no matching drum' : ': past bar 4'})` : '';
    replaceWithUndo(node.id, result.clip, `Imported ${result.imported} notes from “${track}”${skipped}.`);
  };

  const importMid = async () => {
    const file = await pickFile('.mid,.midi,audio/midi');
    if (!file) return;
    try {
      const parsed = readMidi(await file.arrayBuffer());
      if (parsed.tracks.length === 0) showToast(`“${file.name}” has no notes in it.`);
      else if (parsed.tracks.length === 1) importTrack(parsed, parsed.tracks[0].index);
      else setDialog({ kind: 'tracks', parsed });
    } catch {
      showToast(`Couldn't read “${file.name}” as a MIDI file.`);
    }
  };

  const exportMid = () => {
    const bytes = clipsToMidi([{ name: node.data.name, clip }], useProjectStore.getState().bpm);
    downloadBlob(new Blob([bytes.slice()], { type: 'audio/midi' }), `${safeFileName(node.data.name)}.mid`);
  };

  const share = async () => {
    const url = clipShareUrl({ name: node.data.name, clip });
    if (!(await copyLink(url, 'Clip'))) setShareUrl(url);
  };

  const entries: MenuEntry[] = [
    { label: 'Clip library…', onSelect: () => setDialog({ kind: 'library' }) },
    'separator',
    { label: 'Import .mid…', onSelect: () => void importMid() },
    { label: 'Export .mid', onSelect: exportMid },
    'separator',
    { label: 'Copy share link', onSelect: () => void share() },
  ];

  return (
    <>
      <button
        type="button"
        className="ghost-button"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.left, y: rect.bottom + 4 });
        }}
      >
        Clip ▾
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={closeMenu} />}
      {dialog?.kind === 'library' && <LibraryDialog node={node} clip={clip} onClose={closeDialog} />}
      {dialog?.kind === 'tracks' && (
        <TrackPickerDialog parsed={dialog.parsed} drums={drums} onPick={(i) => importTrack(dialog.parsed, i)} onClose={closeDialog} />
      )}
      {shareUrl && (
        <Modal title="Share this clip" onClose={() => setShareUrl(null)}>
          <p className="dialog-note">Anyone opening this link gets the clip added to their clip library.</p>
          <div className="dialog-row">
            <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Share link" />
          </div>
        </Modal>
      )}
    </>
  );
}
