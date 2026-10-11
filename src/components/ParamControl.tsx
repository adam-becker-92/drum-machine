import type { ParamSpec, ParamValue } from '../audio/core/types';
import { Knob } from './Knob';

interface ParamControlProps {
  spec: ParamSpec;
  value: ParamValue | undefined;
  onChange: (value: ParamValue) => void;
  size?: number;
  color?: string;
}

export function ParamControl({ spec, value, onChange, size, color }: ParamControlProps) {
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

interface ParamPanelProps {
  specs: ParamSpec[];
  values: Record<string, ParamValue>;
  onChange: (key: string, value: ParamValue) => void;
  size?: number;
  color?: string;
}

// Knobs laid out in labelled sections by each spec's `group`.
export function ParamGroups({ specs, values, onChange, size = 48, color }: ParamPanelProps) {
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
          <ParamPanel specs={groupSpecs} values={values} onChange={onChange} size={size} color={color} />
        </section>
      ))}
    </div>
  );
}

export function ParamPanel({ specs, values, onChange, size = 56, color }: ParamPanelProps) {
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
        />
      ))}
    </div>
  );
}
