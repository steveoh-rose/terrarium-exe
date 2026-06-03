import * as THREE from "three";
import type { Entity, UpdateCtx } from "./entity";
import type { FieldLight } from "../types";

export class Moon implements Entity {
  kind = "moon" as const;
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
          // carve a crescent by subtracting an offset disc
          float rs = length(p - vec2(0.12, 0.04)) * 2.0;
          float shadow = smoothstep(0.46, 0.42, rs);
          float crescent = clamp(disc - shadow, 0.0, 1.0);
          float glow = smoothstep(1.0, 0.0, r) * 0.22;
          vec3 cool = vec3(0.72, 0.8, 1.0);
          float a = clamp(crescent + glow, 0.0, 1.0);
          gl_FragColor = vec4(cool * a, a);
        }
      `,
    });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.object.renderOrder = 10;
  }

  setRect(cx: number, cy: number, w: number, h: number) {
    this.cx = cx;
    this.cy = cy;
    this.size = Math.min(w, h) * 1.0;
    this.object.scale.set(this.size, this.size, 1);
    this.object.position.set(cx, cy, 0);
  }

  emit(): FieldLight {
    return {
      x: this.cx,
      y: this.cy,
      radius: this.size * 0.7,
      color: [0.28, 0.34, 0.6],
      strength: 0.4,
      warm: 0,
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
