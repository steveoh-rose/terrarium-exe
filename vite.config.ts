import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { interpretPlugin } from "./plugins/interpret";

export default defineConfig(({ mode }) => {
  // Read ANTHROPIC_API_KEY from .env / shell WITHOUT exposing it to the client
  // bundle (only VITE_-prefixed vars are exposed). It stays in the dev server.
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

  return {
    plugins: [react(), interpretPlugin(apiKey)],
    server: { port: 5173, host: true },
  };
});
