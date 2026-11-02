import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ mode }) => {
  // Make .env values available to server code (process.env) during dev and build.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      // Use src/server.ts (the SSR error wrapper) as the server entry.
      tanstackStart({ server: { entry: "server" } }),
      // Builds a Node server by default; set NITRO_PRESET to target another host.
      nitro(),
      viteReact(),
    ],
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: ["react", "react-dom", "@tanstack/react-query"],
    },
  };
});
