import * as THREE from "three";
import type { Entity, UpdateCtx } from "./entity";
import type { FieldLight } from "../types";

export class Sun implements Entity {
  kind = "sun" as const;
  object: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private cx = 0;
  private cy = 0;
  private size = 0;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
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
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float disc = smoothstep(0.46, 0.42, r);
          float glow = smoothstep(1.0, 0.0, r) * 0.45;
          float ang = atan(p.y, p.x);
          float rays = 0.5 + 0.5 * sin(ang * 12.0 + uTime * 0.4);
          float ray = smoothstep(0.42, 0.7, r) * smoothstep(1.0, 0.55, r) * rays * 0.35;
          vec3 warm = vec3(1.0, 0.78, 0.45);
          vec3 core = vec3(1.0, 0.95, 0.78);
          vec3 col = mix(warm, core, disc);
          float a = clamp(disc + glow + ray, 0.0, 1.0);
          gl_FragColor = vec4(col * a, a);
        }
      `,
    });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.object.renderOrder = 10;
  }

  setRect(cx: number, cy: number, w: number, h: number) {
    this.cx = cx;
    this.cy = cy;
    this.size = Math.min(w, h) * 1.15;
    this.object.scale.set(this.size, this.size, 1);
    this.object.position.set(cx, cy, 0);
  }

  emit(): FieldLight {
    return {
      x: this.cx,
      y: this.cy,
      radius: this.size * 0.62,
      color: [1.0, 0.72, 0.42],
      strength: 1.35,
      warm: 1,
    };
  }

  update(ctx: UpdateCtx) {
    this.mat.uniforms.uTime.value = ctx.time;
  }

  dispose() {
    this.object.geometry.dispose();
    this.mat.dispose();
  }
}
