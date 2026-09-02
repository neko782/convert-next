import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import preact from "@preact/preset-vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  publicDir: "public",
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@sqlite.org/sqlite-wasm", "@yowasp/clang"],
  },
  base: "./",
  worker: {
    format: "es",
    plugins: () => [tsconfigPaths()],
  },
  resolve: {
    alias: {
      node_modules: fileURLToPath(new URL("./node_modules", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames(assetInfo) {
          const source = assetInfo.originalFileNames?.[0] || "";
          const fileName = source.split(/[\\/]/).pop();

          const unhashedAssets = new Set([
            "espeakng.worker.js",
            "espeakng.worker.data",
          ]);

          if (fileName && unhashedAssets.has(fileName)) {
            return "assets/[name][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
  plugins: [
    tsconfigPaths(),
    preact({
      prefreshEnabled: false,
      reactAliasesEnabled: true,
    }),
  ],
});
