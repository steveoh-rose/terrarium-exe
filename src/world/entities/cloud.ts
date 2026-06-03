import * as THREE from "three";
import type { Entity, UpdateCtx } from "./entity";
import { sampleWarm, type FieldWater } from "../types";
import { FBM } from "../shaders/lygia";

/**
 * A soft fbm cloud. It broadcasts water (humidity) into the field. Near strong
 * warm light it glows gold and evaporates; when cool it darkens and rains, and
 * the rain falls in WORLD space below it — so a plant window beneath catches it.
 */
export class Cloud implements Entity {
  kind = "cloud" as const;
  object: THREE.Group;
  private cloudMat: THREE.ShaderMaterial;
  private rainMat: THREE.ShaderMaterial;
  private rainMesh: THREE.Mesh;
  private cx = 0;
  private cy = 0;
  private w = 0;
  private h = 0;
  private evap = 0;
  private rain = 0;

  constructor() {
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uEvap: { value: 0 },
        uDensity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uEvap, uDensity;
        ${FBM}
        void main() {
          vec2 p = vUv;
          // Drifting fbm density, shaped into a rounded mound.
          float n = fbm(p * vec2(5.0, 4.0) + vec2(uTime * 0.04, 0.0));
          vec2 d = (p - vec2(0.5, 0.45)) * vec2(1.5, 2.4);
          float oval = 1.0 - dot(d, d);
          float body = smoothstep(0.15, 0.6, n * 0.7 + oval * 0.6);
          float a = body * uDensity;
          vec3 cream = vec3(0.97, 0.88, 0.83);
          vec3 shade = vec3(0.78, 0.66, 0.70);
          vec3 gold = vec3(1.0, 0.82, 0.55);
          vec3 col = mix(shade, cream, smoothstep(0.3, 0.9, n));
          col = mix(col, gold, uEvap * 0.7);
          if (a < 0.02) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.cloudMat);
    cloud.renderOrder = 8;

    this.rainMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uRain: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uRain;
        ${FBM}
        void main() {
          if (uRain < 0.02) discard;
          float cols = 22.0;
          float c = floor(vUv.x * cols);
          float seed = hash21(vec2(c, 1.0));
          if (seed < 0.35) discard;                  // most columns have a streak
          float speed = 1.4 + seed * 1.6;
          float y = fract(vUv.y * 7.0 + uTime * speed + seed * 9.0);
          float streak = smoothstep(0.0, 0.06, y) * smoothstep(0.5, 0.08, y);
          float fade = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
          float a = streak * fade * uRain;
          if (a < 0.02) discard;
          // Bright cool streak so it reads over warm, dithered backgrounds.
          gl_FragColor = vec4(vec3(0.85, 0.92, 1.0), a);
        }
      `,
    });
    this.rainMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.rainMat);
    this.rainMesh.renderOrder = 7;

    this.object = new THREE.Group();
    this.object.add(cloud, this.rainMesh);
  }

  setRect(cx: number, cy: number, w: number, h: number) {
    this.cx = cx;
    this.cy = cy;
    this.w = w;
    this.h = h;
    const cloud = this.object.children[0] as THREE.Mesh;
    cloud.scale.set(w, h, 1);
    cloud.position.set(cx, cy, 0);
    // Rain column hangs below the cloud, in world space.
    const rainH = 520;
    this.rainMesh.scale.set(w * 0.9, rainH, 1);
    this.rainMesh.position.set(cx, cy - h / 2 - rainH / 2 + 10, 0);
  }

  emitWater(): FieldWater {
    return {
      x: this.cx,
      y: this.cy - this.h / 2,
      radius: this.w * 0.5,
      fall: this.rain > 0.3 ? 520 : 90,
      strength: 0.25 + this.rain * 0.7,
    };
  }

  update(ctx: UpdateCtx) {
    const warm = sampleWarm(ctx.field, this.cx, this.cy);
    const evapTarget = Math.min(1, warm * 0.9);
    const rainTarget = Math.max(0, 1 - warm * 2.2); // cool clouds rain
    const k = Math.min(1, ctx.dt * 1.5);
    this.evap += (evapTarget - this.evap) * k;
    this.rain += (rainTarget - this.rain) * k;

    this.cloudMat.uniforms.uTime.value = ctx.time;
    this.cloudMat.uniforms.uEvap.value = this.evap;
    this.cloudMat.uniforms.uDensity.value = 1 - this.evap * 0.55;
    this.rainMat.uniforms.uTime.value = ctx.time;
    this.rainMat.uniforms.uRain.value = this.rain;
  }

  dispose() {
    this.cloudMat.dispose();
    this.rainMat.dispose();
    (this.object.children[0] as THREE.Mesh).geometry.dispose();
    this.rainMesh.geometry.dispose();
  }
}
