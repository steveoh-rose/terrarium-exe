import * as THREE from "three";

export const MAX_LIGHTS = 8;

/**
 * A single full-canvas quad whose fragment shader IS the shared light field.
 * Every window reveals its own slice of this one sky via scissor, so a sun
 * dragged over the city genuinely brightens the sky in that region — there is
 * only one world, the frames are just masks onto it.
 */
export function createSky(width: number, height: number) {
  const geometry = new THREE.PlaneGeometry(1, 1);

  const material = new THREE.ShaderMaterial({
    depthWrite: true,
    depthTest: true,
    uniforms: {
      uResolution: { value: new THREE.Vector2(width, height) },
      uTime: { value: 0 },
      uLightCount: { value: 0 },
      uLightPos: {
        value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector2()),
      },
      uLightColor: {
        value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()),
      },
      uLightRadius: { value: new Float32Array(MAX_LIGHTS) },
      uLightStrength: { value: new Float32Array(MAX_LIGHTS) },
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec2 uResolution;
      uniform float uTime;
      uniform int uLightCount;
      uniform vec2 uLightPos[${MAX_LIGHTS}];
      uniform vec3 uLightColor[${MAX_LIGHTS}];
      uniform float uLightRadius[${MAX_LIGHTS}];
      uniform float uLightStrength[${MAX_LIGHTS}];

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      // Cheap ordered 2x2 Bayer dither, centred on zero.
      float bayer2(vec2 p) {
        float x = mod(floor(p.x), 2.0);
        float y = mod(floor(p.y), 2.0);
        float v = x < 0.5 ? (y < 0.5 ? 0.0 : 3.0) : (y < 0.5 ? 2.0 : 1.0);
        return v / 4.0 - 0.375;
      }

      void main() {
        vec2 frag = gl_FragCoord.xy; // bottom-left origin
        vec3 night = vec3(0.07, 0.06, 0.16);
        vec3 col = night;
        float lightAmt = 0.0;

        for (int i = 0; i < ${MAX_LIGHTS}; i++) {
          if (i >= uLightCount) break;
          float d = distance(frag, uLightPos[i]);
          float a = uLightStrength[i] / (1.0 + pow(d / uLightRadius[i], 2.0));
          col += uLightColor[i] * a;
          lightAmt += a;
        }

        // Stars live only where the field is dark.
        float dark = clamp(1.0 - lightAmt, 0.0, 1.0);
        vec2 cell = floor(frag / 2.0);
        float h = hash(cell);
        float star = step(0.987, h) * dark;
        star *= 0.55 + 0.45 * sin(uTime * 3.0 + h * 100.0);
        col += vec3(star) * 0.9;

        col += bayer2(frag) * 0.025;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -100;
  resizeSky(mesh, width, height);
  return mesh;
}

export function resizeSky(mesh: THREE.Mesh, width: number, height: number) {
  mesh.scale.set(width, height, 1);
  mesh.position.set(width / 2, height / 2, -100);
  const mat = mesh.material as THREE.ShaderMaterial;
  mat.uniforms.uResolution.value.set(width, height);
}
