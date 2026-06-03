import * as THREE from "three";
import { createSky, resizeSky, MAX_LIGHTS } from "./sky";
import type { Entity } from "./entities/entity";
import { Sun } from "./entities/sun";
import { Moon } from "./entities/moon";
import { City } from "./entities/city";
import { contentRect, type WinState, type FieldLight } from "./types";

function makeEntity(kind: WinState["kind"]): Entity {
  switch (kind) {
    case "sun":
      return new Sun();
    case "moon":
      return new Moon();
    case "city":
      return new City();
  }
}

/**
 * One renderer, one scene, one world. Windows are not separate scenes — they
 * are scissor rectangles onto this shared field. See the PRD's core insight.
 */
export class World {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private sky: THREE.Mesh;
  private entities = new Map<string, Entity>();
  private windows: WinState[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private W = 0;
  private H = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      premultipliedAlpha: true,
    });
    this.renderer.setPixelRatio(1); // crisp pixels, predictable scissor coords
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1000, 1000);

    this.W = canvas.clientWidth;
    this.H = canvas.clientHeight;
    this.sky = createSky(this.W, this.H);
    this.scene.add(this.sky);
    this.applySize();
  }

  setWindows(list: WinState[]) {
    this.windows = list;
    const seen = new Set(list.map((w) => w.id));
    // Drop entities whose windows are gone.
    for (const [id, ent] of this.entities) {
      if (!seen.has(id)) {
        this.scene.remove(ent.object);
        ent.dispose();
        this.entities.delete(id);
      }
    }
    // Spawn entities for new windows.
    for (const w of list) {
      if (!this.entities.has(w.id)) {
        const ent = makeEntity(w.kind);
        this.entities.set(w.id, ent);
        this.scene.add(ent.object);
      }
    }
  }

  resize() {
    this.W = this.canvas.clientWidth;
    this.H = this.canvas.clientHeight;
    this.applySize();
  }

  private applySize() {
    this.renderer.setSize(this.W, this.H, false);
    this.camera.left = 0;
    this.camera.right = this.W;
    this.camera.top = this.H; // y-up world, origin bottom-left
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    resizeSky(this.sky, this.W, this.H);
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.time += dt;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame(dt: number) {
    const H = this.H;

    // 1. Position every entity at its window's porthole (world coords, y-up).
    for (const win of this.windows) {
      const ent = this.entities.get(win.id);
      if (!ent) continue;
      const r = contentRect(win);
      const cx = r.x + r.w / 2;
      const cy = H - (r.y + r.h / 2); // CSS top-left -> world y-up
      ent.setRect(cx, cy, r.w, r.h);
    }

    // 2. Gather the field's emitters.
    const lights: FieldLight[] = [];
    for (const win of this.windows) {
      if (win.minimized) continue;
      const l = this.entities.get(win.id)?.emit();
      if (l) lights.push(l);
    }

    // 3. Let reactors sample the field.
    const ctx = { dt, time: this.time, lights };
    for (const ent of this.entities.values()) ent.update(ctx);

    // 4. Upload the field to the sky shader.
    this.uploadLights(lights);

    // 5. Render: clear once, then paint each window's slice via scissor.
    this.renderer.setScissorTest(false);
    this.renderer.clear(true, true, true);
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(0, 0, this.W, this.H);

    const ordered = [...this.windows]
      .filter((w) => !w.minimized)
      .sort((a, b) => a.z - b.z);

    for (const win of ordered) {
      const r = contentRect(win);
      const gx = Math.round(r.x);
      const gy = Math.round(H - (r.y + r.h)); // GL bottom-left origin
      const gw = Math.round(r.w);
      const gh = Math.round(r.h);
      if (gw <= 0 || gh <= 0) continue;
      this.renderer.setScissor(gx, gy, gw, gh);
      this.renderer.render(this.scene, this.camera);
    }
  }

  private uploadLights(lights: FieldLight[]) {
    const mat = this.sky.material as THREE.ShaderMaterial;
    const u = mat.uniforms;
    const n = Math.min(lights.length, MAX_LIGHTS);
    u.uLightCount.value = n;
    const pos = u.uLightPos.value as THREE.Vector2[];
    const col = u.uLightColor.value as THREE.Vector3[];
    const rad = u.uLightRadius.value as Float32Array;
    const str = u.uLightStrength.value as Float32Array;
    for (let i = 0; i < n; i++) {
      const l = lights[i];
      pos[i].set(l.x, l.y); // already world / gl_FragCoord coords (y-up)
      col[i].set(l.color[0], l.color[1], l.color[2]);
      rad[i] = l.radius;
      str[i] = l.strength;
    }
    u.uTime.value = this.time;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const ent of this.entities.values()) ent.dispose();
    this.entities.clear();
    (this.sky.material as THREE.Material).dispose();
    this.sky.geometry.dispose();
    this.renderer.dispose();
  }
}
