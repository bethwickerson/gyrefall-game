import { defineConfig } from "vite";

// base must stay "./" so every asset URL is relative to the page.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
