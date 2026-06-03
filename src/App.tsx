import { useEffect, useRef, useState } from "react";
import { World, type CreatureSeed } from "./world/World";
import { DesktopWindow } from "./components/DesktopWindow";
import { Dock } from "./components/Dock";
import { Controls } from "./components/Controls";
import { PaintWindow } from "./components/PaintWindow";
import { defaultSettings, type RenderSettings } from "./world/settings";
import type { CreatureSpec } from "./interpret/schema";
import type { EntityKind, WinState } from "./world/types";

let uid = 0;
const nextId = () => `w${uid++}`;

const DEFAULT_SIZE: Record<EntityKind, { w: number; h: number }> = {
  sun: { w: 300, h: 252 },
  moon: { w: 280, h: 246 },
  city: { w: 470, h: 320 },
  cloud: { w: 320, h: 220 },
  plant: { w: 280, h: 300 },
  paint: { w: 300, h: 392 },
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
  const [creatures, setCreatures] = useState<CreatureSeed[]>([]);
  const [settings, setSettings] = useState<RenderSettings>(defaultSettings);
  const topZ = useRef(5);

  // Boot the shared world once.
  useEffect(() => {
    if (!canvasRef.current) return;
    const world = new World(canvasRef.current);
    worldRef.current = world;
    world.start();
    const onResize = () => world.resize();
    // Creatures follow the cursor, so you can lead them between windows.
    const onMove = (e: PointerEvent) => {
      world.pointer = { x: e.clientX, y: window.innerHeight - e.clientY, active: true };
    };
    const onLeave = () => {
      if (world.pointer) world.pointer.active = false;
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    worldRef.current?.setWindows(windows);
  }, [windows]);

  useEffect(() => {
    worldRef.current?.setCreatures(creatures);
  }, [creatures]);

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

  // A paint window's drawing came to life: release a roaming creature where it
  // was drawn, and close the paint window.
  const birth = (paintId: string, spec: CreatureSpec) => {
    const paint = windows.find((w) => w.id === paintId);
    if (!paint) return;
    const seed: CreatureSeed = {
      id: nextId(),
      spec,
      x: paint.x + paint.w / 2,
      y: paint.y + paint.h / 2,
    };
    setCreatures((cs) => [...cs, seed]);
    setWindows((ws) => ws.filter((w) => w.id !== paintId));
  };

  const releaseAll = () => setCreatures([]);

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
        draw a creature &nbsp;·&nbsp; it roams the windows &nbsp;·&nbsp; a fish needs water, a bird sleeps in moonlight
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
            body={
              w.kind === "paint" ? (
                <PaintWindow onBirth={(spec) => birth(w.id, spec)} />
              ) : undefined
            }
          />
        ))}
      </div>
      <Dock onAdd={add} onRelease={creatures.length ? releaseAll : undefined} />
    </>
  );
}
