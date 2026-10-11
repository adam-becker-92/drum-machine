import { useCallback, useState } from 'react';
import { findParamSpec } from '../../audio/core/nodeRegistry';
import { TRACKS } from '../../audio/tracks';
import { disableMidi, enableMidi, toggleInput, useMidiStore } from '../../state/midiInput';
import { useProjectStore } from '../../state/projectStore';
import { ContextMenu } from '../ContextMenu';

const STATUS_TEXT = {
  off: 'MIDI is off.',
  pending: 'Waiting for permission… (check for a browser prompt)',
  ready: 'Listening for MIDI.',
  unsupported: 'This browser has no Web MIDI. Use Chrome or Edge.',
  denied: 'MIDI permission was refused. Allow it for this site in the browser settings, then try again.',
};

function paramLabel(nodeType: string | undefined, param: string): string {
  const spec = findParamSpec(nodeType, param);
  const voice = /^v\.([a-z]+)\./.exec(param)?.[1];
  const prefix = voice ? `${TRACKS.find((t) => t.id === voice)?.shortName ?? voice} ` : '';
  return `${prefix}${spec?.label ?? param}`;
}

export function MidiButton() {
  const status = useMidiStore((s) => s.status);
  const inputs = useMidiStore((s) => s.inputs);
  const disabledInputs = useMidiStore((s) => s.disabledInputs);
  const activity = useMidiStore((s) => s.activity);
  const mappings = useProjectStore((s) => s.midiMappings);
  const nodes = useProjectStore((s) => s.nodes);
  const removeMidiMapping = useProjectStore((s) => s.removeMidiMapping);
  const [panel, setPanel] = useState<{ x: number; y: number } | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);

  return (
    <>
      <button
        type="button"
        className={`ghost-button midi-button ${status}`}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPanel({ x: rect.right - 300, y: rect.bottom + 6 });
        }}
        title="MIDI input and controller mappings"
      >
        {/* Re-keyed on every message so its flash animation replays. */}
        <span key={activity} className={`midi-light ${activity ? 'flash' : ''}`} aria-hidden />
        MIDI
      </button>
      {panel && (
        <ContextMenu x={panel.x} y={panel.y} title="MIDI" onClose={closePanel}>
          <div className="midi-panel">
            <p>{STATUS_TEXT[status]}</p>
            {status === 'ready' ? (
              <button type="button" className="ghost-button" onClick={disableMidi}>
                Turn MIDI off
              </button>
            ) : status !== 'unsupported' && status !== 'pending' ? (
              <button type="button" className="ghost-button" onClick={() => void enableMidi()}>
                {status === 'denied' ? 'Try again' : 'Turn MIDI on'}
              </button>
            ) : null}

            {status === 'ready' && (
              <>
                <h4>Devices</h4>
                {inputs.length === 0 && <p className="midi-dim">No MIDI devices found. Plug one in; it'll appear here.</p>}
                {inputs.map((input) => (
                  <label key={input.id} className="midi-device">
                    <input type="checkbox" checked={!disabledInputs.includes(input.id)} onChange={() => toggleInput(input.id)} />
                    {input.name}
                  </label>
                ))}
              </>
            )}

            <h4>Where notes go</h4>
            <p className="midi-dim">
              To the instrument whose tab is open (or that's selected on the graph). For fixed routing, add a{' '}
              <b>MIDI In</b> node and cable its Notes output into instruments, with a channel each.
            </p>

            <h4>Controller knobs</h4>
            {mappings.length === 0 ? (
              <p className="midi-dim">Right-click any knob → MIDI learn, then move a knob on your controller.</p>
            ) : (
              <ul className="midi-mappings">
                {mappings.map((m) => {
                  const node = nodes.find((n) => n.id === m.nodeId);
                  return (
                    <li key={`${m.nodeId}:${m.param}`}>
                      <span>
                        CC {m.cc} · ch {m.channel + 1} → {node?.data.name ?? '?'} · {paramLabel(node?.type, m.param)}
                      </span>
                      <button
                        type="button"
                        className="tab-close"
                        aria-label="Remove mapping"
                        onClick={() => removeMidiMapping(m.nodeId, m.param)}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </ContextMenu>
      )}
    </>
  );
}
