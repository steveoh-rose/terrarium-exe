import { useEffect, useRef, useState } from "react";
import { interpretDrawing } from "../interpret/client";
import type { CreatureSpec } from "../interpret/schema";

const RES = 320; // internal canvas resolution (square)

const COLORS = [
  "#2a2140", "#e86a5c", "#f4a259", "#f6d36b", "#8bbf6a",
  "#5cc2d9", "#8a6fb0", "#f2c0d6", "#ffffff", "#6b4a3a",
];

interface Props {
  onBirth: (spec: CreatureSpec, source: "ai" | "heuristic") => void;
}

export function PaintWindow({ onBirth }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(COLORS[1]);
  const [size, setSize] = useState(10);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }, []);

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * RES, y: ((e.clientY - r.top) / r.height) * RES };
  }

  function down(e: React.PointerEvent) {
    e.stopPropagation();
    drawing.current = true;
    last.current = pos(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    stroke(pos(e)); // dot on tap
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    stroke(pos(e));
  }
  function up() {
    drawing.current = false;
    last.current = null;
  }
  function stroke(p: { x: number; y: number }) {
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size;
    const a = last.current ?? p;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    last.current = p;
  }

  function clear() {
    canvasRef.current!.getContext("2d")!.clearRect(0, 0, RES, RES);
  }

  async function bringToLife() {
    const src = canvasRef.current!;
    setBusy(true);
    setStatus("interpreting…");

    // White-paper version for the vision model to read clearly.
    const wb = document.createElement("canvas");
    wb.width = RES;
    wb.height = RES;
    const wctx = wb.getContext("2d")!;
    wctx.fillStyle = "#f4efe6";
    wctx.fillRect(0, 0, RES, RES);
    wctx.drawImage(src, 0, 0);
    const whiteUrl = wb.toDataURL("image/png");
    const pixels = src.getContext("2d")!.getImageData(0, 0, RES, RES);

    try {
      const { spec, source } = await interpretDrawing(whiteUrl, pixels);
      setStatus(source === "ai" ? `it's ${spec.name}!` : `${spec.name} (offline)`);
      onBirth(spec, source);
    } catch {
      setStatus("hmm, try again");
      setBusy(false);
    }
  }

  return (
    <div className="paint" onPointerDown={(e) => e.stopPropagation()}>
      <div className="paint__tools">
        <div className="paint__swatches">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`paint__swatch${c === color ? " is-active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="paint__sizes">
          {[5, 10, 18].map((s) => (
            <button
              key={s}
              className={`paint__size${s === size ? " is-active" : ""}`}
              onClick={() => setSize(s)}
            >
              <span style={{ width: s, height: s }} />
            </button>
          ))}
          <button className="paint__clear" onClick={clear}>
            clear
          </button>
        </div>
      </div>

      <div className="paint__surface">
        <canvas
          ref={canvasRef}
          width={RES}
          height={RES}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
        />
        {busy && (
          <div className="paint__loading">
            <div className="paint__bar">
              <span />
            </div>
            <div className="paint__loadtext">{status}</div>
          </div>
        )}
      </div>

      <button className="paint__birth" onClick={bringToLife} disabled={busy}>
        ✦ bring to life
      </button>
      {status && !busy && <div className="paint__status">{status}</div>}
    </div>
  );
}
