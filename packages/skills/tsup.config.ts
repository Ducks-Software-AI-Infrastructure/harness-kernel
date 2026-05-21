import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    events: "src/events.ts",
    logs: "src/logs.ts",
    provider: "src/provider.ts",
    registry: "src/registry.ts",
    skill: "src/skill.ts",
    state: "src/state.ts",
    tools: "src/tools.ts"
  },
  format: ["esm"],
  target: "node18",
  clean: true,
  dts: true,
  sourcemap: true,
  external: ["@harness-kernel/core"]
});
