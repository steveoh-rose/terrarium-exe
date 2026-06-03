import { z } from "zod";

/**
 * What the vision model returns: how to *regenerate* the drawing as a polished
 * procedural creature. Colors are extracted from the actual drawing client-side
 * and merged in (see CreatureSpec), so the model focuses on identity + behavior.
 */
export const CreatureSchema = z.object({
  name: z
    .string()
    .describe(
      "a short, lowercase, playful filename for the animal ending in a retro extension like .exe, .gif, .pet, or .bug — e.g. 'koi.pet', 'sparrow.gif', 'toad.exe', 'beetle.bug'"
    ),
  species: z
    .enum(["fish", "bird", "land", "bug", "critter"])
    .describe(
      "what KIND of animal it is, which decides its body shape and how it moves: fish=swims, bird=flies, land=a four-legged land animal, bug=an insect, critter=some other small creature"
    ),
  pattern: z
    .enum(["plain", "striped", "spotted"])
    .describe("its surface markings: plain, striped (clownfish/tiger), or spotted (ladybug/leopard)"),
  blurb: z.string().describe("one short, warm sentence naming the animal and how it behaves"),
  emitsLight: z
    .number()
    .describe("0 to 1: how much light it gives off (usually low — but a firefly or anglerfish glows)"),
  warmth: z.number().describe("-1 (cool, blue) to 1 (warm, golden); the tint of any glow it casts"),
  emitsWater: z.number().describe("0 to 1: how much moisture it gives off (usually 0 for animals)"),
  reactsToLight: z.boolean().describe("does it perk up in light? (most animals do)"),
  reactsToWater: z.boolean().describe("does it come alive in water/rain? (fish and amphibians do)"),
  glow: z.number().describe("0 to 1 strength of its soft aura"),
});

export type ModelSpec = z.infer<typeof CreatureSchema>;

/** Full spec used by the renderer: model output + colors taken from the drawing. */
export interface CreatureSpec extends ModelSpec {
  bodyColor: string; // main color, sampled from the drawing
  accentColor: string; // secondary color (fins, wings, stripes, spots)
}

export const FALLBACK_SPEC: CreatureSpec = {
  name: "doodle.pet",
  species: "critter",
  pattern: "plain",
  blurb: "a little creature, alive and curious.",
  emitsLight: 0.15,
  warmth: 0.2,
  emitsWater: 0,
  reactsToLight: true,
  reactsToWater: true,
  glow: 0.3,
  bodyColor: "#e8a06a",
  accentColor: "#7a4a36",
};
