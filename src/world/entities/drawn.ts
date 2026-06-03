import * as THREE from "three";
import { sampleWarm, sampleWater, type Field, type FieldLight, type FieldWater } from "../types";
import type { CreatureSpec } from "../../interpret/schema";
import { BAYER } from "../shaders/lygia";

const SPECIES_ID: Record<CreatureSpec["species"], number> = {
  fish: 0,
  bird: 1,
  land: 2,
  bug: 3,
  critter: 4,
};
const PATTERN_ID: Record<CreatureSpec["pattern"], number> = { plain: 0, striped: 1, spotted: 2 };

function hexToRGB(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.9, 0.6, 0.4];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Everything a roaming creature can sense and act on each frame. */
export interface CreatureEnv {
  dt: number;
  time: number;
  field: Field;
  W: number;
  H: number;
  pixelSize: number;
  pointer: { x: number; y: number; active: boolean } | null;
  /** Content rects of visible windows, in world coords (y-up). */
  windows: { x: number; y: number; w: number; h: number }[];
  /** Try to nibble a plant at a world point; returns true if something was eaten. */
  biteAt: (x: number, y: number, amount: number) => boolean;
}

/**
 * A drawing reborn as a free-roaming creature. It has its own position in the
 * shared field and wanders the whole desktop, appearing through whatever window
 * it crosses. Its species sets how it travels and what it needs:
 *   - fish can only move where there's water; otherwise it sinks and waits
 *   - birds/bugs roam the air; land animals keep low
 *   - in moonlit/dark regions it shrinks and drifts to sleep
 *   - on the wing it nibbles any plant it passes
 */
export class Drawn {
  spec: CreatureSpec;
  object: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private x: number;
  private y: number;
  private vx = 0;
  private vy = 0;
  private size = 0.2;
  private facing = 1;
  private sleep = 0;
  private live = 0;
  private seed = Math.random() * 10;

  constructor(spec: CreatureSpec, x: number, y: number) {
    this.spec = spec;
    this.x = x;
    this.y = y;
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSpecies: { value: SPECIES_ID[spec.species] },
        uPattern: { value: PATTERN_ID[spec.pattern] },
        uBody: { value: new THREE.Vector3(...hexToRGB(spec.bodyColor)) },
        uAccent: { value: new THREE.Vector3(...hexToRGB(spec.accentColor)) },
        uGlow: { value: spec.glow },
        uLive: { value: 0 },
        uFacing: { value: 1 },
        uSleep: { value: 0 },
        uCells: { value: 44 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uGlow, uLive, uFacing, uSleep, uCells;
        uniform int uSpecies, uPattern;
        uniform vec3 uBody, uAccent;

        ${BAYER}

        float sdCirc(vec2 p, float r) { return length(p) - r; }
        float sdEll(vec2 p, vec2 r) { float k = length(p / r); return (k - 1.0) * min(r.x, r.y); }
        float sdSeg(vec2 p, vec2 a, vec2 b, float r) {
          vec2 pa = p - a, ba = b - a;
          float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
          return length(pa - ba * h) - r;
        }
        float sdTri(vec2 p, vec2 a, vec2 b, vec2 c) {
          vec2 e0 = b - a, e1 = c - b, e2 = a - c;
          vec2 v0 = p - a, v1 = p - b, v2 = p - c;
          vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
          vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
          vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
          float s = sign(e0.x * e2.y - e0.y * e2.x);
          vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                           vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                       vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
          return -sqrt(d.x) * sign(d.y);
        }

        vec3 BODY, ACC, DARK, BELLY;
        const vec3 EW = vec3(0.97, 0.96, 0.93);
        const vec3 EB = vec3(0.09, 0.07, 0.12);

        void put(inout vec3 col, inout float a, inout float sil, float sd, vec3 c) {
          float m = smoothstep(0.009, -0.005, sd);
          col = mix(col, c, m);
          a = max(a, m);
          sil = min(sil, sd);
        }
        void markings(inout vec3 col, inout float a, inout float sil, float bodySd, vec2 p) {
          if (uPattern == 1) { float s = sin(p.x * 34.0); put(col, a, sil, max(bodySd, -s), ACC); }
          else if (uPattern == 2) { vec2 g = fract(p * 7.0) - 0.5; put(col, a, sil, max(bodySd, sdCirc(g, 0.22)), ACC); }
        }
        void eye(inout vec3 col, inout float a, inout float sil, vec2 p, vec2 at, float r) {
          put(col, a, sil, sdCirc(p - at, r), EW);
          put(col, a, sil, sdCirc(p - at - vec2(r * 0.25, 0.0), r * 0.5), EB);
        }

        void drawFish(vec2 p, float t, inout vec3 col, inout float a, inout float sil) {
          float body = sdEll(p, vec2(0.30, 0.17));
          float tailw = sin(t * 5.0) * 0.05;
          float tail = sdTri(p, vec2(-0.24, 0.0), vec2(-0.42, 0.13 + tailw), vec2(-0.42, -0.13 + tailw));
          float dorsal = sdTri(p, vec2(-0.04, 0.15), vec2(0.12, 0.15), vec2(0.02, 0.30));
          put(col, a, sil, min(min(body, tail), dorsal) - 0.022, DARK);
          put(col, a, sil, tail, ACC);
          put(col, a, sil, dorsal, ACC);
          put(col, a, sil, body, BODY);
          put(col, a, sil, max(body, p.y), BELLY);
          markings(col, a, sil, body, p);
          eye(col, a, sil, p, vec2(0.18, 0.05), 0.045);
          put(col, a, sil, sdSeg(p, vec2(0.25, -0.04), vec2(0.30, -0.04), 0.012), DARK);
        }
        void drawBird(vec2 p, float t, inout vec3 col, inout float a, inout float sil) {
          float flap = sin(t * 9.0);
          float body = sdEll(p - vec2(-0.02, -0.04), vec2(0.20, 0.23));
          float head = sdCirc(p - vec2(0.13, 0.17), 0.145);
          float tail = sdTri(p, vec2(-0.18, -0.05), vec2(-0.40, 0.05), vec2(-0.34, -0.16));
          put(col, a, sil, min(min(body, head), tail) - 0.022, DARK);
          put(col, a, sil, tail, ACC);
          put(col, a, sil, body, BODY);
          put(col, a, sil, head, BODY);
          put(col, a, sil, max(body, -(p.y + 0.05)), BELLY);
          markings(col, a, sil, body, p);
          vec2 wp = p - vec2(-0.04, 0.02);
          float ca = cos(flap * 0.5), sa = sin(flap * 0.5);
          wp = mat2(ca, -sa, sa, ca) * wp;
          put(col, a, sil, sdEll(wp, vec2(0.17, 0.075)), ACC);
          put(col, a, sil, sdTri(p, vec2(0.26, 0.18), vec2(0.26, 0.12), vec2(0.37, 0.15)), vec3(0.95, 0.7, 0.3));
          eye(col, a, sil, p, vec2(0.17, 0.20), 0.04);
        }
        void drawLand(vec2 p, float t, inout vec3 col, inout float a, inout float sil) {
          float body = sdEll(p - vec2(-0.02, -0.04), vec2(0.27, 0.16));
          float head = sdCirc(p - vec2(0.22, 0.05), 0.145);
          float ear1 = sdTri(p, vec2(0.15, 0.16), vec2(0.21, 0.16), vec2(0.15, 0.30));
          float ear2 = sdTri(p, vec2(0.26, 0.16), vec2(0.32, 0.16), vec2(0.32, 0.30));
          float legph = sin(t * 6.0) * 0.03;
          float legs = 1e9;
          for (int i = 0; i < 4; i++) {
            float lx = -0.18 + float(i) * 0.13;
            float sw = (mod(float(i), 2.0) < 0.5) ? legph : -legph;
            legs = min(legs, sdSeg(p, vec2(lx, -0.16), vec2(lx + sw, -0.30), 0.035));
          }
          float tail = sdSeg(p, vec2(-0.26, -0.04), vec2(-0.40, 0.10 + 0.03 * sin(t * 3.0)), 0.03);
          put(col, a, sil, min(min(min(body, head), min(ear1, ear2)), min(legs, tail)) - 0.02, DARK);
          put(col, a, sil, legs, DARK);
          put(col, a, sil, tail, BODY);
          put(col, a, sil, ear1, BODY);
          put(col, a, sil, ear2, BODY);
          put(col, a, sil, body, BODY);
          put(col, a, sil, head, BODY);
          put(col, a, sil, max(body, p.y + 0.04), BELLY);
          markings(col, a, sil, body, p);
          eye(col, a, sil, p, vec2(0.26, 0.07), 0.04);
          put(col, a, sil, sdCirc(p - vec2(0.34, 0.0), 0.028), DARK);
        }
        void drawBug(vec2 p, float t, inout vec3 col, inout float a, inout float sil) {
          float abd = sdEll(p - vec2(0.0, -0.06), vec2(0.18, 0.22));
          float head = sdCirc(p - vec2(0.0, 0.18), 0.10);
          float legs = 1e9;
          for (int i = 0; i < 3; i++) {
            float ly = 0.02 - float(i) * 0.12;
            float wig = 0.02 * sin(t * 8.0 + float(i));
            legs = min(legs, sdSeg(p, vec2(0.0, ly), vec2(0.34, ly - 0.08 + wig), 0.018));
            legs = min(legs, sdSeg(p, vec2(0.0, ly), vec2(-0.34, ly - 0.08 + wig), 0.018));
          }
          float ant = min(sdSeg(p, vec2(0.04, 0.26), vec2(0.12, 0.40), 0.014),
                          sdSeg(p, vec2(-0.04, 0.26), vec2(-0.12, 0.40), 0.014));
          put(col, a, sil, legs, DARK);
          put(col, a, sil, ant, DARK);
          put(col, a, sil, min(abd, head) - 0.02, DARK);
          put(col, a, sil, abd, BODY);
          put(col, a, sil, head, DARK);
          put(col, a, sil, sdSeg(p, vec2(0.0, 0.12), vec2(0.0, -0.26), 0.01), DARK);
          markings(col, a, sil, abd, p);
          eye(col, a, sil, p, vec2(0.045, 0.19), 0.028);
          eye(col, a, sil, p, vec2(-0.045, 0.19), 0.028);
        }
        void drawCritter(vec2 p, float t, inout vec3 col, inout float a, inout float sil) {
          float body = sdCirc(p - vec2(0.0, -0.02), 0.27);
          float foot1 = sdEll(p - vec2(-0.10, -0.27), vec2(0.07, 0.04));
          float foot2 = sdEll(p - vec2(0.10, -0.27), vec2(0.07, 0.04));
          put(col, a, sil, min(body, min(foot1, foot2)) - 0.02, DARK);
          put(col, a, sil, foot1, BODY);
          put(col, a, sil, foot2, BODY);
          put(col, a, sil, body, BODY);
          put(col, a, sil, max(body, p.y - 0.05), BELLY);
          markings(col, a, sil, body, p);
          eye(col, a, sil, p, vec2(-0.09, 0.04), 0.06);
          eye(col, a, sil, p, vec2(0.09, 0.04), 0.06);
          put(col, a, sil, sdSeg(p, vec2(-0.04, -0.08), vec2(0.04, -0.08), 0.012), DARK);
        }

        void main() {
          float t = uTime * (0.85 + 0.5 * uLive);
          // Snap to a cell grid so the creature reads as pixel art on its own
          // (it's drawn on top of the world, outside the global pixelation pass).
          vec2 suv = (floor(vUv * uCells) + 0.5) / uCells;
          vec2 p = suv - 0.5;
          p /= (1.0 + 0.02 * sin(t * 1.3));
          if (uFacing < 0.0) p.x = -p.x;
          if (uSpecies == 0) p.x += 0.03 * sin(t * 6.0 + p.y * 14.0);
          else if (uSpecies == 1) p.y /= (1.0 + 0.16 * sin(t * 9.0));
          else if (uSpecies == 3) p /= (1.0 + 0.05 * sin(t * 22.0));

          BODY = uBody;
          ACC = uAccent;
          DARK = uBody * 0.40;
          BELLY = mix(uBody, vec3(1.0), 0.45);

          vec3 col = vec3(0.0);
          float a = 0.0, sil = 1e9;
          if (uSpecies == 0) drawFish(p, t, col, a, sil);
          else if (uSpecies == 1) drawBird(p, t, col, a, sil);
          else if (uSpecies == 2) drawLand(p, t, col, a, sil);
          else if (uSpecies == 3) drawBug(p, t, col, a, sil);
          else drawCritter(p, t, col, a, sil);

          float pulse = 0.75 + 0.25 * sin(uTime * 2.0);
          float aura = smoothstep(0.07, 0.0, sil) * (1.0 - a) * uGlow * pulse * (0.5 + 0.8 * uLive);
          vec3 finalCol = mix(uBody, col * (1.0 + 0.35 * uLive), clamp(a, 0.0, 1.0));
          finalCol *= (1.0 - 0.5 * uSleep); // dim toward sleep
          finalCol += (bayer8(gl_FragCoord.xy) - 0.5) * 0.05; // subtle dither to match
          float outA = clamp(a + aura, 0.0, 1.0) * (1.0 - 0.2 * uSleep);
          if (outA < 0.02) discard;
          gl_FragColor = vec4(finalCol, outA);
        }
      `,
    });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.object.renderOrder = 9;
  }

  emitLight(): FieldLight | null {
    if (this.spec.emitsLight <= 0.05) return null;
    const [r, g, b] = hexToRGB(this.spec.bodyColor);
    return {
      x: this.x,
      y: this.y,
      radius: 90,
      color: [r, g, b],
      strength: this.spec.emitsLight * 1.1 * (1 - this.sleep),
      warm: (this.spec.warmth + 1) / 2,
    };
  }

  emitWater(): FieldWater | null {
    if (this.spec.emitsWater <= 0.05) return null;
    return { x: this.x, y: this.y, radius: 70, fall: 60, strength: this.spec.emitsWater * 0.6 };
  }

  update(env: CreatureEnv) {
    const { dt, field, W, H, pointer, windows } = env;
    const sp = this.spec.species;
    const t = env.time + this.seed * 7;

    const warm = sampleWarm(field, this.x, this.y);
    const water = sampleWater(field, this.x, this.y);
    const night = Math.max(0, Math.min(1, 1 - warm * 2.2));

    // --- steering forces ---
    let ax = Math.cos(t * 0.7 + this.seed) * 8 + Math.cos(t * 1.9) * 4;
    let ay = Math.sin(t * 0.9 + this.seed * 1.3) * 8 + Math.sin(t * 2.3) * 4;

    // Creatures live on the portals: always drift toward a window center, gently
    // while visiting one, strongly when stranded in the void between them.
    let over = false;
    let near: { cx: number; cy: number } | null = null;
    let nd = Infinity;
    for (const r of windows) {
      if (this.x >= r.x && this.x <= r.x + r.w && this.y >= r.y && this.y <= r.y + r.h) over = true;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const d = Math.hypot(cx - this.x, cy - this.y);
      if (d < nd) {
        nd = d;
        near = { cx, cy };
      }
    }
    if (near) {
      const k = over ? 0.1 : 1.4;
      ax += (near.cx - this.x) * k;
      ay += (near.cy - this.y) * k;
    }

    // Species locomotion + medium needs.
    let mobility = 1;
    let sizeTarget = 1;
    if (sp === "fish") {
      if (water < 0.08) {
        mobility = 0.12; // stranded — it can only flop
        ay -= 130; // sinks
        let bw: FieldWater | null = null;
        let bd = Infinity;
        for (const w of field.waters) {
          const d = Math.hypot(w.x - this.x, w.y - this.y);
          if (d < bd) {
            bd = d;
            bw = w;
          }
        }
        if (bw) {
          ax += (bw.x - this.x) * 0.5;
          ay += (bw.y - this.y) * 0.5;
        }
      } else {
        mobility = 1.3;
        sizeTarget = 1.15; // thrives in water
      }
    } else if (sp === "land") {
      ay -= 200; // gravity keeps it low / grounded
    } else if (sp === "bird") {
      ay += 24; // a little lift
    }

    // Cursor curiosity — creatures follow the pointer, so you can lead them.
    if (pointer && pointer.active) {
      const dx = pointer.x - this.x;
      const dy = pointer.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 340) {
        ax += (dx / d) * 70;
        ay += (dy / d) * 70;
      }
    }

    // On the wing, it nibbles any plant it passes (fish don't graze).
    if (sp !== "fish" && env.biteAt(this.x, this.y, 0.12 * dt)) {
      sizeTarget = Math.max(sizeTarget, 1.08);
    }

    // Moonlight / darkness: shrink and drift toward sleep.
    this.sleep += ((night > 0.6 ? 1 : 0) - this.sleep) * Math.min(1, dt * 1.2);
    if (night > 0.6) sizeTarget = 0.5;
    mobility *= 1 - 0.8 * this.sleep;

    // --- integrate ---
    this.vx += ax * dt;
    this.vy += ay * dt;
    const fr = sp === "fish" && water < 0.08 ? 0.85 : 0.93;
    this.vx *= fr;
    this.vy *= fr;
    const cap = (sp === "bug" ? 260 : sp === "bird" ? 200 : 150) * mobility;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > cap) {
      this.vx *= cap / spd;
      this.vy *= cap / spd;
    }
    this.x += this.vx * dt * mobility;
    this.y += this.vy * dt * mobility;

    // keep on screen
    const m = 24;
    if (this.x < m) { this.x = m; this.vx = Math.abs(this.vx); }
    if (this.x > W - m) { this.x = W - m; this.vx = -Math.abs(this.vx); }
    if (this.y < m) { this.y = m; this.vy = Math.abs(this.vy); }
    if (this.y > H - m) { this.y = H - m; this.vy = -Math.abs(this.vy); }

    if (Math.abs(this.vx) > 6) this.facing = this.vx > 0 ? 1 : -1;
    this.size += (sizeTarget - this.size) * Math.min(1, dt * 2);

    let live = 0;
    if (this.spec.reactsToLight) live += Math.min(1, warm);
    if (this.spec.reactsToWater) live += Math.min(1, water);
    this.live += (Math.min(1, live) - this.live) * Math.min(1, dt * 2);

    // --- apply to mesh + shader ---
    const px = 132 * this.size;
    this.object.scale.set(px, px, 1);
    this.object.position.set(this.x, this.y, 0);
    this.mat.uniforms.uTime.value = env.time;
    this.mat.uniforms.uLive.value = this.live;
    this.mat.uniforms.uFacing.value = this.facing;
    this.mat.uniforms.uSleep.value = this.sleep;
    this.mat.uniforms.uCells.value = Math.max(8, Math.round(px / Math.max(1, env.pixelSize)));
  }

  dispose() {
    this.object.geometry.dispose();
    this.mat.dispose();
  }
}
