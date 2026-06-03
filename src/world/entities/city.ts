import * as THREE from "three";
import type { Entity, UpdateCtx } from "./entity";

export class City implements Entity {
  kind = "city" as const;
  object: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private cx = 0;
  private cy = 0;
  private night = 1;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uNight: { value: 1 },
        uSunDir: { value: new THREE.Vector2(0, 1) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uNight;   // 0 = day, 1 = night
        uniform vec2 uSunDir;   // direction toward the dominant warm light

        float rand(float x) { return fract(sin(x * 91.17) * 4123.73); }

        void main() {
          vec2 uv = vUv;
          float cols = 7.0;
          float c = floor(uv.x * cols);
          float localx = fract(uv.x * cols);
          float gap = 0.06;
          float bh = 0.30 + 0.55 * rand(c + 0.5);

          bool inBuild = uv.y < bh && localx > gap && localx < 1.0 - gap;
          if (!inBuild) discard;

          // Directional shading: faces toward the sun catch warm light.
          float facing = 0.5 + 0.5 * sign(uSunDir.x) * (localx - 0.5) * 2.0;
          float lit = mix(1.0, facing, 1.0 - uNight);

          vec3 bodyDay = vec3(0.50, 0.40, 0.55) * (0.7 + 0.3 * lit);
          vec3 bodyNight = vec3(0.10, 0.09, 0.18);
          vec3 col = mix(bodyDay, bodyNight, uNight);

          // Window grid, lit at night.
          vec2 cell = vec2((localx - gap) / (1.0 - 2.0 * gap), uv.y / bh);
          vec2 g = fract(cell * vec2(4.0, 11.0));
          float pane = step(0.22, g.x) * step(g.x, 0.78) * step(0.18, g.y) * step(g.y, 0.82);
          float onoff = step(0.45, rand(c * 13.0 + floor(cell.y * 11.0) * 3.1 + floor(cell.x * 4.0)));
          float flick = 0.7 + 0.3 * sin(uTime * 1.5 + c * 7.0 + floor(cell.y * 11.0));
          float glow = pane * onoff * uNight * flick;
          vec3 winCol = vec3(1.0, 0.82, 0.5);
          col = mix(col, winCol, glow);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.object.renderOrder = 5;
  }

  setRect(cx: number, cy: number, w: number, h: number) {
    this.cx = cx;
    this.cy = cy;
    this.object.scale.set(w, h, 1);
    this.object.position.set(cx, cy, -1);
  }

  update(ctx: UpdateCtx) {
    // Sample warm light arriving at the city; that decides day vs night.
    let warmAmt = 0;
    let dirX = 0;
    let dirY = 0;
    for (const l of ctx.field.lights) {
      if (l.warm <= 0) continue;
      const dx = l.x - this.cx;
      const dy = l.y - this.cy;
      const d = Math.hypot(dx, dy);
      const a = l.strength / (1 + (d / l.radius) ** 2);
      warmAmt += a;
      dirX += dx * a;
      dirY += dy * a;
    }
    const day = Math.min(1, warmAmt);
    const targetNight = 1 - day;
    // Ease so transitions feel like a slow dawn/dusk, not a switch.
    this.night += (targetNight - this.night) * Math.min(1, ctx.dt * 2.5);

    this.mat.uniforms.uNight.value = this.night;
    this.mat.uniforms.uTime.value = ctx.time;
    const len = Math.hypot(dirX, dirY) || 1;
    this.mat.uniforms.uSunDir.value.set(dirX / len, dirY / len);
  }

  dispose() {
    this.object.geometry.dispose();
    this.mat.dispose();
  }
}
