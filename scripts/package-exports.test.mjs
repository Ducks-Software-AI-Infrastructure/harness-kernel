import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(join(tmpdir(), "harness-kernel-exports-"));

const packages = {
  core: "packages/core",
  create: "packages/create",
  "logging-file": "packages/logging-file",
  "provider-ai-sdk": "packages/provider-ai-sdk",
  "provider-openai": "packages/provider-openai",
  "sandbox-docker": "packages/sandbox-docker",
  "sandbox-local": "packages/sandbox-local",
  skills: "packages/skills",
  "storage-file": "packages/storage-file",
  "storage-postgres": "packages/storage-postgres",
  "tools-node": "packages/tools-node",
};

const specs = [
  "@harness-kernel/core",
  "@harness-kernel/core/agent",
  "@harness-kernel/core/agent/mode",
  "@harness-kernel/core/agent/tool",
  "@harness-kernel/core/agent/context",
  "@harness-kernel/core/agent/hook",
  "@harness-kernel/core/agent/role",
  "@harness-kernel/core/agent/event",
  "@harness-kernel/core/agent/session",
  "@harness-kernel/core/runner",
  "@harness-kernel/core/runner/model-provider",
  "@harness-kernel/core/runner/logging",
  "@harness-kernel/core/runner/approval",
  "@harness-kernel/core/runner/event",
  "@harness-kernel/core/runner/sandbox",
  "@harness-kernel/core/runner/storage",
  "@harness-kernel/core/schema",
  "@harness-kernel/create",
  "@harness-kernel/logging-file",
  "@harness-kernel/provider-ai-sdk",
  "@harness-kernel/provider-openai",
  "@harness-kernel/sandbox-docker",
  "@harness-kernel/sandbox-local",
  "@harness-kernel/skills",
  "@harness-kernel/skills/events",
  "@harness-kernel/skills/logs",
  "@harness-kernel/skills/provider",
  "@harness-kernel/skills/registry",
  "@harness-kernel/skills/skill",
  "@harness-kernel/skills/state",
  "@harness-kernel/skills/tools",
  "@harness-kernel/storage-file",
  "@harness-kernel/storage-postgres",
  "@harness-kernel/tools-node",
  "@harness-kernel/tools-node/bash",
  "@harness-kernel/tools-node/files",
];

try {
  const scopeDir = join(tempDir, "node_modules", "@harness-kernel");
  mkdirSync(scopeDir, { recursive: true });
  for (const [name, packagePath] of Object.entries(packages)) {
    symlinkSync(resolve(workspaceRoot, packagePath), join(scopeDir, name), "dir");
  }

  const smokePath = join(tempDir, "smoke.mjs");
  writeFileSync(
    smokePath,
    `${specs.map((spec) => `await import(${JSON.stringify(spec)});`).join("\n")}\n`,
    "utf8",
  );

  const result = spawnSync(process.execPath, [smokePath], {
    cwd: tempDir,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
