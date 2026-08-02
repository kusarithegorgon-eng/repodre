import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  server: {
    port: 8080,
  },
  // Exclude elkjs from Vite's dep pre-bundler so its internal
  // require('web-worker') CJS call is never inlined into the browser bundle.
  optimizeDeps: {
    exclude: ["elkjs"],
  },
  resolve: {
    alias: {
      // elkjs bundles a CJS `require('web-worker')` that has no browser
      // equivalent. We pass our own workerFactory to ELK so the import
      // is never used — alias it to a stub so Rollup doesn't crash.
      "web-worker": "/src/lib/worker-stub.ts",
    },
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
