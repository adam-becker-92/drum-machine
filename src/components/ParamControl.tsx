import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';
import type { ParamSpec, ParamValue } from '../audio/core/types';
import { cancelLearning, startLearning, useMidiStore } from '../state/midiInput';
import { useProjectStore } from '../state/projectStore';
import { ContextMenu, type MenuEntry } from './ContextMenu';
import { Knob } from './Knob';

interface ParamControlProps {
  spec: ParamSpec;
  value: ParamValue | undefined;
  onChange: (value: ParamValue) => void;
  size?: number;
  color?: string;
  // With a node id, right-click offers MIDI learn for this param.
  nodeId?: string;
  // The param's key in the node's params when it differs from spec.key (drum voices).
  paramKey?: string;
}

function Control({ spec, value, onChange, size, color }: ParamControlProps) {
  if (spec.kind === 'number') {
    return (
      <Knob
        label={spec.label}
        value={typeof value === 'number' ? value : spec.default}
        min={spec.min}
        max={spec.max}
        defaultValue={spec.default}
        scale={spec.scale}
        unit={spec.unit}
        step={spec.step}
        size={size}
        color={color}
        onChange={onChange}
      />
    );
  }

  if (spec.kind === 'bool') {
    const on = value === true;
    return (
      <div className="param-toggle nodrag">
        <button type="button" aria-pressed={on} className={on ? 'on' : ''} onClick={() => onChange(!on)}>
          {spec.label}
        </button>
      </div>
    );
  }

  const current = typeof value === 'string' ? value : spec.default;
  return (
    <div className="param-select nodrag">
      <span className="param-select-label">{spec.label}</span>
      {spec.options.length <= 4 ? (
        <div className="segmented" role="radiogroup" aria-label={spec.label}>
          {spec.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={current === opt.value}
              className={current === opt.value ? 'on' : ''}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <select value={current} onChange={(e) => onChange(e.target.value)} aria-label={spec.label}>
          {spec.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// A knob/toggle/selector for one param. Right-click: MIDI learn, unmap, reset.
export function ParamControl(props: ParamControlProps) {
  const { spec, onChange, nodeId } = props;
  const key = props.paramKey ?? spec.key;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const learning = useMidiStore((s) => (nodeId && s.learning?.nodeId === nodeId && s.learning.param === key ? true : false));
  const mapping = useProjectStore((s) => (nodeId ? s.midiMappings.find((m) => m.nodeId === nodeId && m.param === key) : undefined));
  const removeMidiMapping = useProjectStore((s) => s.removeMidiMapping);

  const onContextMenu = (e: MouseEvent) => {
    if (!nodeId) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  let entries: MenuEntry[] = [];
  if (menu && nodeId) {
    entries = [
      learning
        ? { label: 'Cancel MIDI learn', onSelect: cancelLearning }
        : { label: 'MIDI learn (then move a controller knob)', onSelect: () => startLearning(nodeId, key) },
      ...(mapping
        ? [{ label: `Unmap CC ${mapping.cc} · ch ${mapping.channel + 1}`, onSelect: () => removeMidiMapping(nodeId, key) }]
        : []),
      'separator',
      { label: 'Reset to default', onSelect: () => onChange(spec.default) },
    ];
  }

  let wrapped: ReactNode = <Control {...props} />;
  if (nodeId) {
    wrapped = (
      <div
        className={`param-control ${learning ? 'learning' : ''} ${mapping ? 'mapped' : ''}`}
        onContextMenu={onContextMenu}
        title={mapping ? `MIDI CC ${mapping.cc} (ch ${mapping.channel + 1})` : undefined}
      >
        <Control {...props} />
        {menu && <ContextMenu x={menu.x} y={menu.y} title={spec.label} entries={entries} onClose={closeMenu} />}
      </div>
    );
  }
  return wrapped;
}

interface ParamPanelProps {
  specs: ParamSpec[];
  values: Record<string, ParamValue>;
  onChange: (key: string, value: ParamValue) => void;
  size?: number;
  color?: string;
  nodeId?: string;
}

// Knobs laid out in labelled sections by each spec's `group`.
export function ParamGroups({ specs, values, onChange, size = 48, color, nodeId }: ParamPanelProps) {
  const groups = new Map<string, ParamSpec[]>();
  for (const spec of specs) {
    const name = spec.group ?? 'Settings';
    groups.set(name, [...(groups.get(name) ?? []), spec]);
  }
  return (
    <div className="param-groups">
      {[...groups].map(([name, groupSpecs]) => (
        <section key={name} className="param-group">
          <h4>{name}</h4>
          <ParamPanel specs={groupSpecs} values={values} onChange={onChange} size={size} color={color} nodeId={nodeId} />
        </section>
      ))}
    </div>
  );
}

export function ParamPanel({ specs, values, onChange, size = 56, color, nodeId }: ParamPanelProps) {
  return (
    <div className="param-panel">
      {specs.map((spec) => (
        <ParamControl
          key={spec.key}
          spec={spec}
          value={values[spec.key]}
          onChange={(v) => onChange(spec.key, v)}
          size={size}
          color={color}
          nodeId={nodeId}
        />
      ))}
    </div>
  );
}
