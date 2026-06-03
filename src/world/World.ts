import * as THREE from "three";
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  PixelationEffect,
} from "postprocessing";
import { createSky, resizeSky, MAX_LIGHTS } from "./sky";
import { DitherEffect } from "./effects/DitherEffect";
import { defaultSettings, type RenderSettings } from "./settings";
import type { Entity } from "./entities/entity";
import { Sun } from "./entities/sun";
import { Moon } from "./entities/moon";
import { City } from "./entities/city";
import { Cloud } from "./entities/cloud";
import { Plant } from "./entities/plant";
import { Drawn } from "./entities/drawn";
import {
  contentRect,
  type WinState,
  type Field,
  type FieldLight,
  type FieldWater,
} from "./types";
import type { CreatureSpec } from "../interpret/schema";

/** A roaming creature's identity + where it was born (CSS px, top-left). */
export interface CreatureSeed {
  id: string;
  spec: CreatureSpec;
  x: number;
  y: number;
}

/** Build the world entity for a window, or null for windows that have none (paint). */
function makeEntity(win: WinState): Entity | null {
  switch (win.kind) {
    case "sun":
      return new Sun();
    case "moon":
      return new Moon();
    case "city":
      return new City();
    case "cloud":
      return new Cloud();
    case "plant":
      return new Plant();
    case "paint":
      return null; // a DOM drawing surface, not a world entity
  }
}

/**
 * One renderer, one scene, one world. The scene is rendered to a low-res
 * buffer, post-processed (bloom -> Bayer dither/posterise), then composited:
 * each window is a scissor rectangle revealing its slice of that single
 * processed image, so the pixel grid is consistent across the whole desktop.
 */
export class World {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private creatureScene: THREE.Scene; // creatures roam on top of everything
  private camera: THREE.OrthographicCamera;
  private sky: THREE.Mesh;
  private composer: EffectComposer;
  private bloom: BloomEffect;
  private pixelation: PixelationEffect;
  private dither: DitherEffect;

  // Final composite: a fullscreen quad sampling the processed texture.
  private screenScene: THREE.Scene;
  private screenCam: THREE.OrthographicCamera;
  private screenMat: THREE.ShaderMaterial;

  private entities = new Map<string, Entity>();
  private creatures = new Map<string, Drawn>();
  private windows: WinState[] = [];
  settings: RenderSettings = { ...defaultSettings };
  /** Cursor position in world coords (y-up), set by React; creatures follow it. */
  pointer: { x: number; y: number; active: boolean } | null = null;

  private raf = 0;
  private last = 0;
  private time = 0;
  private W = 0;
  private H = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.creatureScene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1000, 1000);

    this.W = canvas.clientWidth;
    this.H = canvas.clientHeight;
    this.sky = createSky(this.W, this.H);
    this.scene.add(this.sky);

    // Post-processing chain, output kept in a buffer (not straight to screen).
    this.composer = new EffectComposer(this.renderer);
    this.composer.autoRenderToScreen = false;
    this.bloom = new BloomEffect({
      intensity: this.settings.bloom,
      luminanceThreshold: 0.45,
      luminanceSmoothing: 0.5,
      mipmapBlur: true,
      radius: 0.7,
    });
    this.pixelation = new PixelationEffect(this.settings.pixelSize);
    this.dither = new DitherEffect({
      dither: this.settings.dither,
      levels: this.settings.levels,
      warm: this.settings.warm,
    });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new EffectPass(this.camera, this.bloom, this.pixelation, this.dither)
    );

    // Composite quad: clip-space plane sampling the processed world.
    this.screenScene = new THREE.Scene();
    this.screenCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.screenMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { uTex: { value: null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        void main() { gl_FragColor = texture2D(uTex, vUv); }
      `,
    });
    this.screenScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.screenMat));

    this.applySize();
  }

  setWindows(list: WinState[]) {
    this.windows = list;
    const seen = new Set(list.map((w) => w.id));
    for (const [id, ent] of this.entities) {
      if (!seen.has(id)) {
        this.scene.remove(ent.object);
        ent.dispose();
        this.entities.delete(id);
      }
    }
    for (const w of list) {
      if (!this.entities.has(w.id)) {
        const ent = makeEntity(w);
        if (ent) {
          this.entities.set(w.id, ent);
          this.scene.add(ent.object);
        }
      }
    }
  }

  /** Sync the set of roaming creatures (born from paint windows). */
  setCreatures(list: CreatureSeed[]) {
    const seen = new Set(list.map((c) => c.id));
    for (const [id, cr] of this.creatures) {
      if (!seen.has(id)) {
        this.creatureScene.remove(cr.object);
        cr.dispose();
        this.creatures.delete(id);
      }
    }
    for (const c of list) {
      if (!this.creatures.has(c.id)) {
        // Spawn at the paint window's location (CSS top-left -> world y-up).
        const cr = new Drawn(c.spec, c.x, this.H - c.y);
        this.creatures.set(c.id, cr);
        this.creatureScene.add(cr.object);
      }
    }
  }

  /** World-space content rects of the portal windows creatures can appear in. */
  private portalRects() {
    const H = this.H;
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    for (const win of this.windows) {
      if (win.minimized || !this.entities.has(win.id)) continue;
      const r = contentRect(win);
      rects.push({ x: r.x, y: H - (r.y + r.h), w: r.w, h: r.h });
    }
    return rects;
  }

  /** Nibble a plant whose portal contains the world point; returns true if eaten. */
  private biteAt = (x: number, y: number, amount: number): boolean => {
    const H = this.H;
    for (const win of this.windows) {
      if (win.kind !== "plant" || win.minimized) continue;
      const r = contentRect(win);
      const wx = r.x, wy = H - (r.y + r.h);
      if (x >= wx && x <= wx + r.w && y >= wy && y <= wy + r.h) {
        const ent = this.entities.get(win.id);
        if (ent instanceof Plant) {
          ent.bite(amount);
          return true;
        }
      }
    }
    return false;
  };

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
    // Composer/canvas stay at full resolution; the pixel grid comes from
    // PixelationEffect, so the canvas never gets shrunk underneath us.
    this.composer.setSize(this.W, this.H);
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
      ent.setRect(r.x + r.w / 2, H - (r.y + r.h / 2), r.w, r.h);
    }

    // 2. Gather the field's emitters — from windows AND roaming creatures.
    const lights: FieldLight[] = [];
    const waters: FieldWater[] = [];
    for (const win of this.windows) {
      if (win.minimized) continue;
      const ent = this.entities.get(win.id);
      const l = ent?.emitLight?.();
      if (l) lights.push(l);
      const w = ent?.emitWater?.();
      if (w) waters.push(w);
    }
    for (const cr of this.creatures.values()) {
      const l = cr.emitLight();
      if (l) lights.push(l);
      const w = cr.emitWater();
      if (w) waters.push(w);
    }
    const field: Field = { lights, waters };

    // 3. Let window reactors sample the field.
    const ctx = { dt, time: this.time, field };
    for (const ent of this.entities.values()) ent.update(ctx);

    // 3b. Let creatures roam: sense the field, the portals, and the cursor.
    if (this.creatures.size) {
      const env = {
        dt,
        time: this.time,
        field,
        W: this.W,
        H: this.H,
        pixelSize: this.settings.pixelSize,
        pointer: this.pointer,
        windows: this.portalRects(),
        biteAt: this.biteAt,
      };
      for (const cr of this.creatures.values()) cr.update(env);
    }

    // 4. Sync live settings into the post chain + upload the light field.
    this.bloom.intensity = this.settings.bloom;
    this.pixelation.granularity = this.settings.pixelSize;
    this.dither.dither = this.settings.dither;
    this.dither.levels = this.settings.levels;
    this.dither.warm = this.settings.warm;
    this.dither.pixel = this.settings.pixelSize;
    this.uploadLights(lights);

    // 5. Render the world through the post chain (result -> outputBuffer).
    this.renderer.setScissorTest(false);
    this.composer.render(dt);

    // 6. Composite each window's slice of the processed world to the canvas.
    this.renderer.setRenderTarget(null);
    this.renderer.setScissorTest(false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, true);
    this.screenMat.uniforms.uTex.value = this.composer.outputBuffer.texture;
    this.renderer.setViewport(0, 0, this.W, this.H);
    this.renderer.setScissorTest(true);

    // Only windows backed by a world entity get a portal slice; paint windows
    // render their own opaque DOM canvas instead.
    const ordered = [...this.windows]
      .filter((w) => !w.minimized && this.entities.has(w.id))
      .sort((a, b) => a.z - b.z);
    for (const win of ordered) {
      const r = contentRect(win);
      const gx = Math.round(r.x);
      const gy = Math.round(H - (r.y + r.h));
      const gw = Math.round(r.w);
      const gh = Math.round(r.h);
      if (gw <= 0 || gh <= 0) continue;
      this.renderer.setScissor(gx, gy, gw, gh);
      this.renderer.render(this.screenScene, this.screenCam);
    }

    // 7. Creatures roam ON TOP of the desktop — always visible, passing in
    //    front of the windows they cross.
    if (this.creatures.size) {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.W, this.H);
      this.renderer.render(this.creatureScene, this.camera);
    }
  }

  private uploadLights(lights: FieldLight[]) {
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    const n = Math.min(lights.length, MAX_LIGHTS);
    u.uLightCount.value = n;
    const pos = u.uLightPos.value as THREE.Vector2[];
    const col = u.uLightColor.value as THREE.Vector3[];
    const rad = u.uLightRadius.value as Float32Array;
    const str = u.uLightStrength.value as Float32Array;
    for (let i = 0; i < n; i++) {
      const l = lights[i];
      pos[i].set(l.x, l.y);
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
    for (const cr of this.creatures.values()) cr.dispose();
    this.creatures.clear();
    (this.sky.material as THREE.Material).dispose();
    this.sky.geometry.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
