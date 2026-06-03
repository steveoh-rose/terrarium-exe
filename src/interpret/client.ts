import { type CreatureSpec, type ModelSpec, FALLBACK_SPEC } from "./schema";

interface Palette {
  bodyColor: string;
  accentColor: string;
}

/**
 * Interpret a drawing into a living creature spec. The colors always come from
 * the user's actual strokes (extracted locally); the species/pattern/behavior
 * come from Claude vision, or a shape heuristic when there's no API key.
 */
export async function interpretDrawing(
  whiteBgDataUrl: string,
  pixels: ImageData
): Promise<{ spec: CreatureSpec; source: "ai" | "heuristic" }> {
  const palette = extractPalette(pixels);
  try {
    const res = await fetch("/api/interpret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: whiteBgDataUrl }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.spec) {
        return { spec: { ...(data.spec as ModelSpec), ...palette }, source: "ai" };
      }
    }
  } catch {
    /* fall through to heuristic */
  }
  return { spec: heuristicSpec(pixels, palette), source: "heuristic" };
}

const hex2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** Pull the two dominant, distinct colors from the drawing. */
export function extractPalette(img: ImageData): Palette {
  const { data, width, height } = img;
  const buckets = new Map<number, { c: number; r: number; g: number; b: number }>();
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (data[o + 3] < 40) continue;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = buckets.get(key) ?? { c: 0, r: 0, g: 0, b: 0 };
    e.c++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }
  const list = [...buckets.values()]
    .map((e) => ({ r: e.r / e.c, g: e.g / e.c, b: e.b / e.c, c: e.c }))
    .sort((a, b) => b.c - a.c);
  if (list.length === 0) return { bodyColor: FALLBACK_SPEC.bodyColor, accentColor: FALLBACK_SPEC.accentColor };

  const body = list[0];
  // Accent = next dominant colour far enough from the body colour.
  const dist = (p: typeof body) => Math.hypot(p.r - body.r, p.g - body.g, p.b - body.b);
  const accent = list.find((p) => dist(p) > 70) ?? {
    r: body.r * 0.55,
    g: body.g * 0.5,
    b: body.b * 0.5,
    c: 0,
  };
  return { bodyColor: toHex(body.r, body.g, body.b), accentColor: toHex(accent.r, accent.g, accent.b) };
}

/** Guess the animal from the drawing's shape when no model is available. */
export function heuristicSpec(img: ImageData, palette: Palette): CreatureSpec {
  const { data, width, height } = img;
  let n = 0,
    sumY = 0,
    minX = width,
    maxX = 0,
    minY = height,
    maxY = 0,
    rSum = 0,
    bSum = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 40) continue;
      n++;
      sumY += y / height;
      rSum += data[i];
      bSum += data[i + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (n === 0) return { ...FALLBACK_SPEC, ...palette };

  const centroidY = sumY / n;
  const aspect = (maxX - minX || 1) / (maxY - minY || 1);
  const coverage = n / (width * height);
  const warmth = Math.max(-1, Math.min(1, (rSum - bSum) / n / 128));
  const blueish = bSum > rSum + 8 * n;

  let species: CreatureSpec["species"];
  if (blueish || aspect > 1.45) species = "fish";
  else if (centroidY < 0.42) species = "bird";
  else if (coverage < 0.05) species = "bug";
  else species = "land";

  const names: Record<CreatureSpec["species"], string> = {
    fish: "koi.pet",
    bird: "sparrow.gif",
    land: "critter.exe",
    bug: "beetle.bug",
    critter: "doodle.pet",
  };

  return {
    name: names[species],
    species,
    pattern: "plain",
    blurb: "a little animal pulled straight from your strokes.",
    emitsLight: 0.06,
    warmth,
    emitsWater: 0,
    reactsToLight: true,
    reactsToWater: species === "fish",
    glow: 0.3,
    ...palette,
  };
}
