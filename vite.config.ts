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
    // Strip debug/info log calls from production bundles.
    // console.error and console.warn are preserved for runtime error reporting.
    pure: ["console.log", "console.debug", "console.info"],
    drop: ["debugger"],
  },
});
