import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node18",
  clean: true,
  dts: true,
  sourcemap: true,
  external: ["@ai-sdk/openai", "@harness-kernel/core", "@harness-kernel/provider-ai-sdk"]
});
