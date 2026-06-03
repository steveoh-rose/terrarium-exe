import { useState } from "react";
import type { RenderSettings } from "../world/settings";

interface Props {
  settings: RenderSettings;
  onChange: (next: RenderSettings) => void;
}

interface Row {
  key: keyof RenderSettings;
  label: string;
  min: number;
  max: number;
  step: number;
}

const ROWS: Row[] = [
  { key: "pixelSize", label: "pixel", min: 1, max: 8, step: 1 },
  { key: "dither", label: "dither", min: 0, max: 1.5, step: 0.05 },
  { key: "levels", label: "colors", min: 2, max: 16, step: 1 },
  { key: "bloom", label: "bloom", min: 0, max: 2.5, step: 0.05 },
  { key: "warm", label: "warmth", min: 0, max: 1, step: 0.05 },
];

export function Controls({ settings, onChange }: Props) {
  const [open, setOpen] = useState(true);

  const set = (key: keyof RenderSettings, value: number) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="panel">
      <div className="panel__bar" onClick={() => setOpen((o) => !o)}>
        <span>render.cfg</span>
        <span>{open ? "–" : "+"}</span>
      </div>
      {open && (
        <div className="panel__body">
          {ROWS.map((r) => (
            <label key={r.key} className="panel__row">
              <span className="panel__label">{r.label}</span>
              <input
                type="range"
                min={r.min}
                max={r.max}
                step={r.step}
                value={settings[r.key]}
                onChange={(e) => set(r.key, Number(e.target.value))}
              />
              <span className="panel__val">{settings[r.key]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
