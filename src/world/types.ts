export type EntityKind = "sun" | "moon" | "city" | "cloud" | "plant";

/** A window's authoritative state, owned by React, read by the World each frame. */
export interface WinState {
  id: string;
  kind: EntityKind;
  x: number; // CSS px, top-left of the frame
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
}

export const TITLE_H = 26; // must match .win__titlebar height in styles.css

/** The transparent porthole (content area) of a window, in CSS px, top-left origin. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function contentRect(win: WinState): Rect {
  return { x: win.x, y: win.y + TITLE_H, w: win.w, h: win.h - TITLE_H };
}

/** A light emitter sampled by the shared Field (sky + reactors). World px, y-up. */
export interface FieldLight {
  x: number;
  y: number;
  radius: number;
  color: [number, number, number];
  strength: number;
  warm: number; // 1 = sun-like (drives daytime), 0 = moon-like (cool)
}

/**
 * A water emitter (humidity from clouds, rain columns) sampled by reactors.
 * Rain falls, so water has a downward reach: `fall` extends the radius below y.
 */
export interface FieldWater {
  x: number;
  y: number;
  radius: number;
  fall: number; // extra vertical reach downward (rain column)
  strength: number;
}

/** Everything reactors can sample at a world position this frame. */
export interface Field {
  lights: FieldLight[];
  waters: FieldWater[];
}

/** Sample warm (daytime) light arriving at a world point. */
export function sampleWarm(field: Field, x: number, y: number): number {
  let amt = 0;
  for (const l of field.lights) {
    if (l.warm <= 0) continue;
    const d = Math.hypot(l.x - x, l.y - y);
    amt += (l.strength * l.warm) / (1 + (d / l.radius) ** 2);
  }
  return amt;
}

/** Sample water arriving at a world point (rain reaches downward). */
export function sampleWater(field: Field, x: number, y: number): number {
  let amt = 0;
  for (const w of field.waters) {
    const dx = w.x - x;
    // Below the emitter (rain falling), extend reach by `fall`.
    const below = y < w.y ? Math.min(w.y - y, w.fall) : 0;
    const dy = (w.y - y) - below;
    const d = Math.hypot(dx, dy);
    amt += w.strength / (1 + (d / w.radius) ** 2);
  }
  return amt;
}
