import { useEffect, useRef, useState } from "react";
import { World } from "./world/World";
import { DesktopWindow } from "./components/DesktopWindow";
import { Dock } from "./components/Dock";
import { Controls } from "./components/Controls";
import { defaultSettings, type RenderSettings } from "./world/settings";
import type { EntityKind, WinState } from "./world/types";

let uid = 0;
const nextId = () => `w${uid++}`;

const DEFAULT_SIZE: Record<EntityKind, { w: number; h: number }> = {
  sun: { w: 300, h: 252 },
  moon: { w: 280, h: 246 },
  city: { w: 470, h: 320 },
  cloud: { w: 320, h: 220 },
  plant: { w: 280, h: 300 },
};

function win(kind: EntityKind, x: number, y: number, z: number): WinState {
  return { id: nextId(), kind, x: Math.round(x), y: Math.round(y), ...DEFAULT_SIZE[kind], z, minimized: false };
}

function initialWindows(): WinState[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return [
    // A little ecosystem to tend: city + plant below, sky-makers above.
    win("city", (vw - DEFAULT_SIZE.city.w) / 2 + 120, vh - DEFAULT_SIZE.city.h - 70, 1),
    win("plant", 80, vh - DEFAULT_SIZE.plant.h - 70, 2),
    win("sun", 60, 70, 3),
    win("cloud", (vw - DEFAULT_SIZE.cloud.w) / 2, 60, 4),
    win("moon", vw - DEFAULT_SIZE.moon.w - 60, 90, 5),
  ];
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const [windows, setWindows] = useState<WinState[]>(initialWindows);
  const [settings, setSettings] = useState<RenderSettings>(defaultSettings);
  const topZ = useRef(5);

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

  // Live render settings: mutate the world's settings object in place.
  useEffect(() => {
    if (worldRef.current) Object.assign(worldRef.current.settings, settings);
  }, [settings]);

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
        drag the sun to the plant &nbsp;·&nbsp; a cloud above it rains &nbsp;·&nbsp; the moon brings night
      </div>
      <Controls settings={settings} onChange={setSettings} />
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
