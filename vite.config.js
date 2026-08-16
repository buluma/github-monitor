import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// The Svelte front-end lives in `web/` and builds into `public/` so the
// existing Node server (server.js) keeps serving it as static files. `base:
// "./"` keeps asset URLs relative, which also keeps the `--snapshot` static
// export working.
export default defineConfig({
  root: "web",
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4177",
      "/health": "http://127.0.0.1:4177",
    },
  },
});
