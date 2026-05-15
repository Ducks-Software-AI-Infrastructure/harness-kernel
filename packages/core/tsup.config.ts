import { defineConfig } from "tsup";

const entries = {
  index: "src/index.ts",
  agent: "src/exports/agent.ts",
  "agent/mode": "src/exports/agent/mode.ts",
  "agent/tool": "src/exports/agent/tool.ts",
  "agent/context": "src/exports/agent/context.ts",
  "agent/hook": "src/exports/agent/hook.ts",
  "agent/role": "src/exports/agent/role.ts",
  "agent/event": "src/exports/agent/event.ts",
  "agent/session": "src/exports/agent/session.ts",
  runner: "src/exports/runner.ts",
  "runner/model-provider": "src/exports/runner/model-provider.ts",
  "runner/logging": "src/exports/runner/logging.ts",
  "runner/approval": "src/exports/runner/approval.ts",
  "runner/event": "src/exports/runner/event.ts",
  "runner/sandbox": "src/exports/runner/sandbox.ts",
  "runner/storage": "src/exports/runner/storage.ts",
  schema: "src/schema/index.ts"
};

export default defineConfig({
  entry: entries,
  format: ["esm"],
  target: "node18",
  clean: true,
  dts: true,
  sourcemap: true
});
