export type EntityKind = "sun" | "moon" | "city";

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

/** A light emitter sampled by the shared Field (sky + reactors). */
export interface FieldLight {
  x: number; // world px (same as CSS px, bottom-left origin handled at upload)
  y: number; // CSS px, top-left origin — converted where needed
  radius: number;
  color: [number, number, number];
  strength: number;
  warm: number; // 1 = sun-like (drives daytime), 0 = moon-like (cool)
}
