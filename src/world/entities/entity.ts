import * as THREE from "three";
import type { EntityKind, Field, FieldLight, FieldWater } from "../types";

export interface UpdateCtx {
  dt: number;
  time: number;
  /** Everything emitted into the shared field this frame (lights + waters). */
  field: Field;
}

export interface Entity {
  kind: EntityKind;
  object: THREE.Object3D;
  /** Place + size the entity to fill a window's porthole (world px, y-up). */
  setRect(cx: number, cy: number, w: number, h: number): void;
  /** Light this entity broadcasts into the field, if any. */
  emitLight?(): FieldLight | null;
  /** Water this entity broadcasts into the field, if any. */
  emitWater?(): FieldWater | null;
  update(ctx: UpdateCtx): void;
  dispose(): void;
}
