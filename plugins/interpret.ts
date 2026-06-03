import type { Plugin } from "vite";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CreatureSchema } from "../src/interpret/schema";

const SYSTEM = `You are the interpreter for "Terrarium.exe" — a dreamy living desktop where each window is a portal into one shared little world of light and water. The user has scribbled an animal in a tiny retro paint program, and you bring it to life so it can swim, fly, or scamper across the desktop.

Look at the drawing and decide, generously and playfully, what ANIMAL it is — then pick the species category that decides how it moves:
- fish  → anything that swims (fish, koi, whale, tadpole, eel). Loves water (reactsToWater true).
- bird  → anything that flies (bird, owl, bat, butterfly if it mostly flutters).
- land  → a land animal that walks or hops (cat, dog, frog, rabbit, bear, lizard, snail).
- bug   → a small insect that flits and darts (beetle, bee, ant, spider).
- critter→ any other little creature that doesn't fit cleanly.

The drawing will be REGENERATED as a clean little pixel-art creature, so read its essence: the species sets its body, and note its markings via the pattern field — plain, striped (clownfish, tiger, bee), or spotted (ladybug, leopard, dalmatian). (Its colors are taken from the drawing automatically; you don't choose them.)

Most animals enjoy light (reactsToLight true) and give off almost no light themselves — but a firefly, anglerfish, or glowing jellyfish can emit a soft light (set emitsLight and a warmth that matches its glow). Fish and amphibians come alive in water/rain. Give it a fitting lowercase filename and a one-sentence blurb.

Never refuse and never say you can't tell — every scribble is some animal. If it's abstract, invent a charming little creature for it and pick the species that feels right. Respond only via the structured format.`;

export function interpretPlugin(apiKey: string | undefined): Plugin {
  return {
    name: "terrarium-interpret",
    configureServer(server) {
      server.middlewares.use("/api/interpret", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("method not allowed");
          return;
        }
        if (!apiKey) {
          // No key configured — tell the client to use its heuristic fallback.
          res.statusCode = 503;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "no_api_key" }));
          return;
        }
        try {
          const body = await readJson(req);
          const dataUrl = typeof body.image === "string" ? body.image : "";
          const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
          if (!base64) throw new Error("no image");

          const client = new Anthropic({ apiKey });
          const message = await client.messages.parse({
            model: "claude-opus-4-8",
            max_tokens: 1024,
            system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: { type: "base64", media_type: "image/png", data: base64 },
                  },
                  {
                    type: "text",
                    text: "Bring this drawing to life. What creature or element is it, and how does it behave in the shared world?",
                  },
                ],
              },
            ],
            output_config: { format: zodOutputFormat(CreatureSchema), effort: "low" },
          });

          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ spec: message.parsed_output }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          server.config.logger.error(`[interpret] ${msg}`);
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: msg }));
        }
      });
    },
  };
}

function readJson(req: import("http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
