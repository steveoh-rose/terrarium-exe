import { Effect } from "postprocessing";
import { Uniform } from "three";
import { BAYER } from "../shaders/lygia";

/**
 * Bayer-dithered colour-depth reduction — the halftone/limited-palette look
 * from the references. Runs as the final post pass over the (already bloomed)
 * low-res world. `dither` and `levels` are live-tunable.
 */
const fragment = /* glsl */ `
  uniform float uDither;
  uniform float uLevels;
  uniform float uWarm;
  uniform float uPixel;

  ${BAYER}

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = inputColor.rgb;

    // Gentle warm autumn grade: lift reds, ease blues toward amber.
    vec3 warmed = c * vec3(1.06, 0.99, 0.86) + vec3(0.04, 0.015, 0.0);
    c = mix(c, warmed, uWarm);

    // Ordered dither aligned to the pixel grid: one Bayer value per pixel
    // cell, so the 8x8 pattern reads as clean dithering, not scanlines.
    vec2 cell = floor(uv * resolution / max(1.0, uPixel));
    float threshold = bayer8(cell) - 0.5;
    float steps = max(2.0, uLevels);
    c += threshold * uDither / steps;
    c = floor(c * (steps - 1.0) + 0.5) / (steps - 1.0);

    outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
  }
`;

export interface DitherOptions {
  dither?: number;
  levels?: number;
  warm?: number;
  pixel?: number;
}

export class DitherEffect extends Effect {
  constructor({ dither = 0.6, levels = 6, warm = 1, pixel = 3 }: DitherOptions = {}) {
    super("DitherEffect", fragment, {
      uniforms: new Map<string, Uniform<number>>([
        ["uDither", new Uniform(dither)],
        ["uLevels", new Uniform(levels)],
        ["uWarm", new Uniform(warm)],
        ["uPixel", new Uniform(pixel)],
      ]),
    });
  }

  set dither(v: number) {
    (this.uniforms.get("uDither") as Uniform<number>).value = v;
  }
  set levels(v: number) {
    (this.uniforms.get("uLevels") as Uniform<number>).value = v;
  }
  set warm(v: number) {
    (this.uniforms.get("uWarm") as Uniform<number>).value = v;
  }
  set pixel(v: number) {
    (this.uniforms.get("uPixel") as Uniform<number>).value = v;
  }
}
