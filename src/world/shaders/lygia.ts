/**
 * Small grab-bag of LYGIA-style GLSL helpers, inlined so the build stays
 * offline (no #include resolver). Techniques mirror lygia.xyz:
 *   - recursive ordered Bayer dithering  (color/dither/bayer)
 *   - Inigo Quilez cosine palette         (color/palette)
 *   - value-noise fbm                     (generative/fbm)
 * Concatenate these strings into shader sources that need them.
 */

// Recursive Bayer ordered-dither threshold in [0,1). Cheap, no arrays/bitwise.
export const BAYER = /* glsl */ `
  float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
`;

// IQ cosine palette: a + b * cos(2pi (c t + d)).
export const PALETTE = /* glsl */ `
  vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318530718 * (c * t + d));
  }
`;

// Hash + value noise + fbm (for clouds / rain).
export const FBM = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      v += amp * vnoise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return v;
  }
`;
