import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { newNoteId } from '../audio/clips';
import { engine } from '../audio/core/engineInstance';
import type { Note, NoteClip } from '../audio/core/types';
import { noteName } from '../audio/dsp';
import { pressNote, releaseNote, useLiveStore } from '../state/liveInput';
import { useProjectStore, useTransportStore } from '../state/projectStore';

const TOP_PITCH = 96; // C7
const BOTTOM_PITCH = 24; // C1
const ROWS = TOP_PITCH - BOTTOM_PITCH + 1;
const ROW_H = 14;
const KEYS_W = 54;
const LANE_H = 56;
const EDGE_PX = 7; // grab zone for lengthening a note
const BLACK = new Set([1, 3, 6, 8, 10]);

function cellWidth(length: number): number {
  return length <= 16 ? 44 : length <= 32 ? 28 : 18;
}

interface Drag {
  mode: 'move' | 'resize' | 'draw';
  id: string;
  x: number;
  y: number;
  orig: Note;
  moved: boolean;
}

interface PianoRollProps {
  nodeId: string;
  clip: NoteClip;
  color: string;
}

export function PianoRoll({ nodeId, clip, color }: PianoRollProps) {
  const setNotes = useProjectStore((s) => s.setNotes);
  const currentStep = useTransportStore((s) => s.currentStep);
  const held = useLiveStore((s) => s.held);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawLength, setDrawLength] = useState(2);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const laneDrag = useRef(false);
  const cellW = cellWidth(clip.length);
  const gridW = clip.length * cellW;

  // Open scrolled to where the notes are (or around middle C). Only on mount:
  // afterwards the scroll position is the user's.
  const initialPitches = useRef(clip.notes.map((n) => n.pitch));
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pitches = initialPitches.current;
    const centre = pitches.length ? (Math.min(...pitches) + Math.max(...pitches)) / 2 : 60;
    el.scrollTop = (TOP_PITCH - centre) * ROW_H - el.clientHeight / 2 + 30;
  }, []);

  const notes = () => {
    const live = useProjectStore.getState().clips[nodeId];
    return live?.kind === 'notes' ? live.notes : [];
  };

  const update = (id: string, patch: Partial<Note>) =>
    setNotes(nodeId, notes().map((n) => (n.id === id ? { ...n, ...patch } : n)));

  const remove = (id: string) => {
    setNotes(nodeId, notes().filter((n) => n.id !== id));
    if (selected === id) setSelected(null);
  };

  const audition = (pitch: number) => {
    engine.noteOn(nodeId, pitch, 0.75);
    window.setTimeout(() => engine.noteOff(nodeId, pitch), 180);
  };

  const local = (e: PointerEvent) => {
    const rect = gridRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onGridPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const { x, y } = local(e);
    const noteEl = (e.target as HTMLElement).closest<HTMLElement>('[data-note-id]');
    let note: Note | undefined;
    let mode: Drag['mode'];
    if (noteEl) {
      note = notes().find((n) => n.id === noteEl.dataset.noteId);
      if (!note) return;
      mode = x > (note.start + note.length) * cellW - EDGE_PX ? 'resize' : 'move';
    } else {
      const start = Math.floor(x / cellW);
      const pitch = TOP_PITCH - Math.floor(y / ROW_H);
      note = { id: newNoteId(), pitch, start, length: Math.min(drawLength, clip.length - start), velocity: 0.8 };
      setNotes(nodeId, [...notes(), note]);
      audition(pitch);
      mode = 'draw';
    }
    setSelected(note.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag.current = { mode, id: note.id, x: e.clientX, y: e.clientY, orig: note, moved: false };
  };

  const onGridPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
    if (!d.moved) return;
    const { x } = local(e);
    if (d.mode === 'move') {
      const start = Math.min(clip.length - d.orig.length, Math.max(0, d.orig.start + Math.round((e.clientX - d.x) / cellW)));
      const pitch = Math.min(TOP_PITCH, Math.max(BOTTOM_PITCH, d.orig.pitch + Math.round((d.y - e.clientY) / ROW_H)));
      const current = notes().find((n) => n.id === d.id);
      if (current && (current.start !== start || current.pitch !== pitch)) {
        if (current.pitch !== pitch) audition(pitch);
        update(d.id, { start, pitch });
      }
    } else {
      const length = Math.min(clip.length - d.orig.start, Math.max(1, Math.ceil((x - d.orig.start * cellW) / cellW)));
      const current = notes().find((n) => n.id === d.id);
      if (current && current.length !== length) update(d.id, { length });
    }
  };

  const onGridPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved && d.mode !== 'move') {
      const note = notes().find((n) => n.id === d.id);
      if (note) setDrawLength(note.length);
    }
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const note = notes().find((n) => n.id === selected);
    if (!note) return;
    const moves: Record<string, Partial<Note>> = {
      ArrowUp: { pitch: Math.min(TOP_PITCH, note.pitch + (e.shiftKey ? 12 : 1)) },
      ArrowDown: { pitch: Math.max(BOTTOM_PITCH, note.pitch - (e.shiftKey ? 12 : 1)) },
      ArrowLeft: { start: Math.max(0, note.start - 1) },
      ArrowRight: { start: Math.min(clip.length - note.length, note.start + 1) },
    };
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(note.id);
    } else if (moves[e.key]) {
      e.preventDefault();
      update(note.id, moves[e.key]);
      if (moves[e.key].pitch !== undefined) audition(moves[e.key].pitch!);
    }
  };

  // Velocity lane: drag up/down over a step to set the loudness of the notes starting there.
  const paintVelocity = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const step = Math.floor((e.clientX - rect.left) / cellW);
    const velocity = Math.min(1, Math.max(0.05, 1 - (e.clientY - rect.top) / LANE_H));
    const all = notes();
    if (!all.some((n) => n.start === step)) return;
    setNotes(nodeId, all.map((n) => (n.start === step ? { ...n, velocity } : n)));
  };

  const playhead = currentStep >= 0 ? currentStep % clip.length : -1;
  const rows = Array.from({ length: ROWS }, (_, i) => TOP_PITCH - i);

  return (
    <div
      className="piano-roll"
      style={{ '--cell-w': `${cellW}px`, '--row-h': `${ROW_H}px`, '--roll-color': color } as CSSProperties}
    >
      <div className="roll-scroll" ref={scrollRef}>
        <div className="roll-inner" style={{ width: KEYS_W + gridW }}>
          <div className="roll-ruler">
            <div className="roll-corner" style={{ width: KEYS_W }} />
            {Array.from({ length: clip.length / 4 }, (_, beat) => (
              <span key={beat} className={beat % 4 === 0 ? 'bar' : ''} style={{ width: cellW * 4 }}>
                {beat % 4 === 0 ? beat / 4 + 1 : `${Math.floor(beat / 4) + 1}.${(beat % 4) + 1}`}
              </span>
            ))}
          </div>

          <div className="roll-body">
            <div className="roll-keys" style={{ width: KEYS_W }}>
              {rows.map((pitch) => (
                <div
                  key={pitch}
                  className={[
                    'roll-key',
                    BLACK.has(pitch % 12) ? 'black' : 'white',
                    held.includes(pitch) ? 'held' : '',
                  ].join(' ')}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    pressNote(pitch, 0.8, nodeId);
                  }}
                  onPointerUp={() => releaseNote(pitch)}
                  onPointerCancel={() => releaseNote(pitch)}
                >
                  {pitch % 12 === 0 ? noteName(pitch) : ''}
                </div>
              ))}
            </div>

            <div
              className="roll-grid"
              ref={gridRef}
              tabIndex={0}
              style={{ width: gridW, height: ROWS * ROW_H }}
              onPointerDown={onGridPointerDown}
              onPointerMove={onGridPointerMove}
              onPointerUp={onGridPointerUp}
              onPointerCancel={onGridPointerUp}
              onKeyDown={onGridKeyDown}
              aria-label="Piano roll"
            >
              {rows.map((pitch) => (
                <div
                  key={pitch}
                  className={`roll-row ${BLACK.has(pitch % 12) ? 'black' : ''} ${pitch % 12 === 0 ? 'octave' : ''}`}
                />
              ))}
              <div className="roll-lines" />
              {clip.notes.map((note) => (
                <div
                  key={note.id}
                  data-note-id={note.id}
                  className={`roll-note ${note.id === selected ? 'selected' : ''}`}
                  style={{
                    left: note.start * cellW,
                    top: (TOP_PITCH - note.pitch) * ROW_H,
                    width: note.length * cellW - 1,
                    opacity: 0.45 + 0.55 * note.velocity,
                  }}
                  title={`${noteName(note.pitch)} · velocity ${Math.round(note.velocity * 100)}%`}
                  onDoubleClick={() => remove(note.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    remove(note.id);
                  }}
                />
              ))}
              {playhead >= 0 && <div className="roll-playhead" style={{ left: playhead * cellW }} />}
            </div>
          </div>

          <div className="roll-lane">
            <div className="roll-lane-label" style={{ width: KEYS_W }}>
              Vel
            </div>
            <div
              className="roll-lane-bars"
              style={{ width: gridW, height: LANE_H }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                laneDrag.current = true;
                paintVelocity(e);
              }}
              onPointerMove={(e) => laneDrag.current && paintVelocity(e)}
              onPointerUp={() => (laneDrag.current = false)}
              onPointerCancel={() => (laneDrag.current = false)}
            >
              {clip.notes.map((note) => (
                <span
                  key={note.id}
                  className={note.id === selected ? 'selected' : ''}
                  style={{ left: note.start * cellW + 3, height: Math.max(2, note.velocity * (LANE_H - 4)) }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
