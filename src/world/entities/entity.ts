import * as THREE from "three";
import type { EntityKind, FieldLight } from "../types";

export interface UpdateCtx {
  dt: number;
  time: number;
  /** All emitters currently in the field (sun/moon). */
  lights: FieldLight[];
}

export interface Entity {
  kind: EntityKind;
  object: THREE.Object3D;
  /** Place + size the entity to fill a window's porthole (CSS px, world space). */
  setRect(cx: number, cy: number, w: number, h: number): void;
  /** Light this entity broadcasts into the field, if any. */
  emit(): FieldLight | null;
  update(ctx: UpdateCtx): void;
  dispose(): void;
}
