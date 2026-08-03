import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  server: {
    port: 8080,
  },
  build: {
    minify: "esbuild",
  },
  esbuild: {
    pure: ["console.log", "console.debug", "console.info"],
    drop: ["debugger"],
  },
  optimizeDeps: {
    include: ["elkjs/lib/elk-api.js"],
  },
});
