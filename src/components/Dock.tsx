import type { EntityKind } from "../world/types";

interface Props {
  onAdd: (kind: EntityKind) => void;
}

const ITEMS: { kind: EntityKind; label: string }[] = [
  { kind: "sun", label: "+ sun" },
  { kind: "moon", label: "+ moon" },
  { kind: "city", label: "+ city" },
  { kind: "cloud", label: "+ cloud" },
  { kind: "plant", label: "+ plant" },
];

export function Dock({ onAdd }: Props) {
  return (
    <div className="dock">
      {ITEMS.map((it) => (
        <button key={it.kind} className="dock__btn" onClick={() => onAdd(it.kind)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
