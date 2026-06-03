import type { EntityKind } from "../world/types";

interface Props {
  onAdd: (kind: EntityKind) => void;
  /** Provided only when there are creatures to release. */
  onRelease?: () => void;
}

const ITEMS: { kind: EntityKind; label: string }[] = [
  { kind: "paint", label: "✦ paint" },
  { kind: "sun", label: "+ sun" },
  { kind: "moon", label: "+ moon" },
  { kind: "city", label: "+ city" },
  { kind: "cloud", label: "+ cloud" },
  { kind: "plant", label: "+ plant" },
];

export function Dock({ onAdd, onRelease }: Props) {
  return (
    <div className="dock">
      {ITEMS.map((it) => (
        <button key={it.kind} className="dock__btn" onClick={() => onAdd(it.kind)}>
          {it.label}
        </button>
      ))}
      {onRelease && (
        <button className="dock__btn dock__btn--alt" onClick={onRelease}>
          ✕ release
        </button>
      )}
    </div>
  );
}
