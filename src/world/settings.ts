/** Live-tunable render settings, shared between the React controls and the World. */
export interface RenderSettings {
  pixelSize: number; // downscale factor; bigger = chunkier pixels
  dither: number; // ordered-dither strength
  levels: number; // colour-depth steps per channel
  bloom: number; // bloom intensity
  warm: number; // warm autumn colour grade (0..1)
}

export const defaultSettings: RenderSettings = {
  pixelSize: 3,
  dither: 0.65,
  levels: 6,
  bloom: 0.9,
  warm: 1,
};
