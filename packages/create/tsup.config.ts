import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/index": "src/cli/index.ts"
  },
  format: ["esm"],
  target: "node18",
  clean: true,
  dts: true,
  sourcemap: true,
  external: []
});
