import * as THREE from "three";
import type { Entity, UpdateCtx } from "./entity";
import { sampleWarm, sampleWater } from "../types";

/**
 * The terrarium's heart. A potted plant that needs balance: light AND water.
 * - light + water  -> grows, leaves and blossoms unfurl
 * - lots of sun, no water -> droughts and wilts (recovers when watered)
 * - night (no light) -> dormant, flowers close
 * Never a fail state: it always recovers with care.
 */
export class Plant implements Entity {
  kind = "plant" as const;
  object: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private cx = 0;
  private cy = 0;
  private growth = 0.25;
  private bloom = 0;
  private wilt = 0;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uGrowth: { value: 0.25 },
        uBloom: { value: 0 },
        uWilt: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime, uGrowth, uBloom, uWilt;

        mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
        float sdSeg(vec2 p, vec2 a, vec2 b, float r){
          vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
          return length(pa-ba*h)-r;
        }
        float sdEll(vec2 p, vec2 r){ return (length(p/r)-1.0)*min(r.x,r.y); }
        float flower(vec2 p, float r, float open){
          float ang = atan(p.y, p.x);
          float pr = r * (0.45 + 0.55*open) * (0.72 + 0.28*cos(ang*5.0));
          return length(p) - pr;
        }
        void put(inout vec3 col, inout float a, float sd, vec3 c){
          float m = smoothstep(0.006, -0.002, sd);
          col = mix(col, c, m);
          a = max(a, m);
        }

        void main(){
          vec2 uv = vUv;
          vec3 col = vec3(0.0);
          float a = 0.0;

          // --- pot ---
          float potTop = 0.22, potBot = 0.04;
          float potHalf = mix(0.20, 0.15, (uv.y - potBot) / (potTop - potBot));
          if (uv.y > potBot && uv.y < potTop && abs(uv.x-0.5) < potHalf) {
            vec3 terra = mix(vec3(0.66,0.36,0.28), vec3(0.78,0.46,0.34), (uv.y-potBot)*3.0);
            put(col, a, -0.001, terra);
          }
          // pot rim
          if (uv.y > potTop-0.03 && uv.y < potTop+0.012 && abs(uv.x-0.5) < 0.205) {
            put(col, a, -0.001, vec3(0.82,0.5,0.38));
          }
          // soil
          put(col, a, sdEll(uv-vec2(0.5,potTop), vec2(0.165,0.022)), vec3(0.26,0.18,0.15));

          // --- stem ---
          float stemLen = 0.14 + uGrowth*0.55;
          vec2 base = vec2(0.5, potTop);
          vec2 top  = base + vec2(uWilt*0.14, stemLen);
          vec3 green = mix(vec3(0.36,0.46,0.26), vec3(0.45,0.56,0.30), 0.5);
          put(col, a, sdSeg(uv, base, top, 0.012), green);
          vec2 dir = normalize(top - base);
          vec2 nor = vec2(-dir.y, dir.x);

          // --- leaves (unlock with growth) ---
          float tts[3];   tts[0]=0.32; tts[1]=0.55; tts[2]=0.74;
          float thr[3];   thr[0]=0.22; thr[1]=0.45; thr[2]=0.66;
          for (int i=0;i<3;i++){
            if (uGrowth < thr[i]) continue;
            vec2 sp = mix(base, top, tts[i]);
            float wob = 0.02*sin(uTime*1.2 + float(i));
            for (float s=-1.0; s<=1.0; s+=2.0){
              vec2 c = sp + nor*0.085*s + dir*0.02;
              vec2 q = (uv - c);
              q = rot(s*(0.7+wob) + (top.x-0.5)) * q;
              put(col, a, sdEll(q, vec2(0.075,0.032)), green);
            }
          }

          // --- blossoms (forget-me-not, autumn-recoloured) ---
          vec2 fpos[5];
          fpos[0]=vec2(0.0,0.0); fpos[1]=vec2(-0.06,0.03); fpos[2]=vec2(0.06,0.02);
          fpos[3]=vec2(-0.03,-0.05); fpos[4]=vec2(0.04,-0.045);
          float fthr[5]; fthr[0]=0.30; fthr[1]=0.5; fthr[2]=0.62; fthr[3]=0.78; fthr[4]=0.88;
          for (int i=0;i<5;i++){
            if (uGrowth < fthr[i]) continue;
            vec2 c = top + fpos[i];
            vec2 q = uv - c;
            float r = 0.052;
            float sd = flower(q, r, uBloom);
            vec3 petal = mix(vec3(0.55,0.6,0.42), vec3(0.96,0.55,0.42), uBloom); // bud->coral
            put(col, a, sd, petal);
            // cream center when open
            if (uBloom > 0.4) put(col, a, length(q)-r*0.22, vec3(1.0,0.92,0.66));
          }

          if (a < 0.02) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.object.renderOrder = 6;
  }

  setRect(cx: number, cy: number, w: number, h: number) {
    this.cx = cx;
    this.cy = cy;
    const s = Math.min(w, h);
    this.object.scale.set(s, s, 1);
    this.object.position.set(cx, cy, 0);
  }

  /** A creature nibbles the plant, setting its growth back. */
  bite(amount: number) {
    this.growth = Math.max(0, this.growth - amount);
  }

  update(ctx: UpdateCtx) {
    const light = sampleWarm(ctx.field, this.cx, this.cy);
    const water = sampleWater(ctx.field, this.cx, this.cy);

    const night = light < 0.1;
    const happy = light > 0.12 && water > 0.08;
    const drought = light > 0.5 && water < 0.04;

    let dG = 0;
    if (happy) dG = 0.06;
    else if (drought) dG = -0.04;
    this.growth = Math.max(0, Math.min(1, this.growth + dG * ctx.dt));

    const wiltTarget = drought ? 1 : 0;
    this.wilt += (wiltTarget - this.wilt) * Math.min(1, ctx.dt * (drought ? 0.6 : 1.5));

    const bloomTarget = !night && this.growth > 0.3 && this.wilt < 0.5 ? 1 : 0;
    this.bloom += (bloomTarget - this.bloom) * Math.min(1, ctx.dt * 1.2);

    this.mat.uniforms.uTime.value = ctx.time;
    this.mat.uniforms.uGrowth.value = this.growth;
    this.mat.uniforms.uBloom.value = this.bloom;
    this.mat.uniforms.uWilt.value = this.wilt;
  }

  dispose() {
    this.object.geometry.dispose();
    this.mat.dispose();
  }
}
