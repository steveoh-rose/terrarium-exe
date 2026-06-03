import { useRef, type ReactNode } from "react";
import type { WinState } from "../world/types";

interface Props {
  win: WinState;
  onMove: (id: string, x: number, y: number) => void;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  /** Opaque DOM content (e.g. the paint surface) instead of a world porthole. */
  body?: ReactNode;
}

const TITLES: Record<WinState["kind"], string> = {
  sun: "sun.exe",
  moon: "moon.exe",
  city: "city.gif",
  cloud: "cloud.exe",
  plant: "terra.exe",
  paint: "paint.exe",
};

export function DesktopWindow({ win, onMove, onFocus, onClose, onMinimize, body }: Props) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    onFocus(win.id);
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    onMove(win.id, e.clientX - drag.current.dx, e.clientY - drag.current.dy);
  }
  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const h = win.minimized ? 26 : win.h;

  return (
    <div
      className={`win${drag.current ? " win--dragging" : ""}`}
      style={{ left: win.x, top: win.y, width: win.w, height: h, zIndex: win.z }}
      onPointerDown={() => onFocus(win.id)}
    >
      <div
        className="win__titlebar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="win__title">{win.title ?? TITLES[win.kind]}</span>
        <div className="win__buttons">
          <button
            className="win__btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onMinimize(win.id)}
            title="minimize"
          >
            _
          </button>
          <button
            className="win__btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onClose(win.id)}
            title="close"
          >
            ✕
          </button>
        </div>
      </div>
      {!win.minimized && (
        <div className={`win__content${body ? " win__content--solid" : ""}`}>
          {body ?? <div className="win__scanlines" />}
        </div>
      )}
    </div>
  );
}
