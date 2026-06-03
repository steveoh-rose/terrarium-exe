import { useEffect, useRef, useState } from "react";
import { World } from "./world/World";
import { DesktopWindow } from "./components/DesktopWindow";
import { Dock } from "./components/Dock";
import type { EntityKind, WinState } from "./world/types";

let uid = 0;
const nextId = () => `w${uid++}`;

const DEFAULT_SIZE: Record<EntityKind, { w: number; h: number }> = {
  sun: { w: 300, h: 252 },
  moon: { w: 280, h: 246 },
  city: { w: 470, h: 320 },
};

function initialWindows(): WinState[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return [
    // City sits centre-bottom and starts in darkness — bring a light to it.
    {
      id: nextId(),
      kind: "city",
      x: Math.round((vw - DEFAULT_SIZE.city.w) / 2),
      y: Math.round(vh - DEFAULT_SIZE.city.h - 90),
      ...DEFAULT_SIZE.city,
      z: 1,
      minimized: false,
    },
    { id: nextId(), kind: "sun", x: 70, y: 80, ...DEFAULT_SIZE.sun, z: 2, minimized: false },
    {
      id: nextId(),
      kind: "moon",
      x: Math.round(vw - DEFAULT_SIZE.moon.w - 60),
      y: 90,
      ...DEFAULT_SIZE.moon,
      z: 3,
      minimized: false,
    },
  ];
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const [windows, setWindows] = useState<WinState[]>(initialWindows);
  const topZ = useRef(3);

  // Boot the shared world once.
  useEffect(() => {
    if (!canvasRef.current) return;
    const world = new World(canvasRef.current);
    worldRef.current = world;
    world.start();
    const onResize = () => world.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  // Push window state to the world every render.
  useEffect(() => {
    worldRef.current?.setWindows(windows);
  }, [windows]);

  const focus = (id: string) =>
    setWindows((ws) => {
      const z = ++topZ.current;
      return ws.map((w) => (w.id === id ? { ...w, z } : w));
    });

  const move = (id: string, x: number, y: number) =>
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, x, y } : w)));

  const close = (id: string) => setWindows((ws) => ws.filter((w) => w.id !== id));

  const minimize = (id: string) =>
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, minimized: !w.minimized } : w)));

  const add = (kind: EntityKind) =>
    setWindows((ws) => {
      const z = ++topZ.current;
      const jitter = (ws.length % 5) * 24;
      return [
        ...ws,
        {
          id: nextId(),
          kind,
          x: 360 + jitter,
          y: 200 + jitter,
          ...DEFAULT_SIZE[kind],
          z,
          minimized: false,
        },
      ];
    });

  return (
    <>
      <canvas id="world-canvas" ref={canvasRef} />
      <div className="hint">
        drag the sun toward the city &nbsp;·&nbsp; or the moon, for nightfall
      </div>
      <div className="desktop">
        {windows.map((w) => (
          <DesktopWindow
            key={w.id}
            win={w}
            onMove={move}
            onFocus={focus}
            onClose={close}
            onMinimize={minimize}
          />
        ))}
      </div>
      <Dock onAdd={add} />
    </>
  );
}
