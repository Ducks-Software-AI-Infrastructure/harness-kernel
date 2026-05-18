import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(join(tmpdir(), "harness-kernel-consumer-"));
const packDir = join(tempDir, "packs");
const consumerDir = join(tempDir, "consumer");

const packageDirs = [
  "packages/core",
  "packages/logging-file",
  "packages/provider-ai-sdk",
  "packages/provider-openai",
  "packages/sandbox-local",
  "packages/storage-file",
  "packages/storage-postgres",
  "packages/tools-node",
  "packages/create",
];

const publicImports = [
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
  "@harness-kernel/logging-file",
  "@harness-kernel/provider-ai-sdk",
  "@harness-kernel/provider-openai",
  "@harness-kernel/sandbox-local",
  "@harness-kernel/storage-file",
  "@harness-kernel/storage-postgres",
  "@harness-kernel/tools-node",
  "@harness-kernel/tools-node/bash",
  "@harness-kernel/tools-node/files",
  "@harness-kernel/create",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
  assert.equal(result.status, 0, [
    `$ ${command} ${args.join(" ")}`,
    result.stdout,
    result.stderr,
  ].filter(Boolean).join("\n"));
  return result;
}

try {
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  const tarballs = packageDirs.map((packageDir) => {
    const result = run("npm", ["pack", resolve(workspaceRoot, packageDir), "--pack-destination", packDir]);
    const filename = result.stdout.trim().split(/\r?\n/u).at(-1);
    assert.ok(filename?.endsWith(".tgz"), `npm pack did not return a tarball name for ${packageDir}.`);
    const tarball = join(packDir, filename);
    const packageJson = run("tar", ["-xOf", tarball, "package/package.json"]).stdout;
    assert.equal(packageJson.includes("workspace:"), false, `${filename} contains workspace protocol dependencies.`);
    return tarball;
  });

  writeFileSync(join(consumerDir, "package.json"), JSON.stringify({ type: "module", private: true }, null, 2));
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs], { cwd: consumerDir });

  const smokeSource = `
    import assert from "node:assert/strict";
    ${publicImports.map((spec, index) => `const module${index} = await import(${JSON.stringify(spec)});`).join("\n")}
    import { defineAgent } from "@harness-kernel/core/agent";
    import { HarnessMode } from "@harness-kernel/core/agent/mode";
    import { createHarnessSessionStore } from "@harness-kernel/core/runner";
    import { MemorySessionStorage } from "@harness-kernel/core/runner/storage";
    import { NoopSandbox } from "@harness-kernel/core/runner/sandbox";

    assert.equal(typeof module0.createHarnessSessionStore, "function");
    assert.equal(typeof module17.JsonlFileLogSink, "function");
    assert.equal(typeof module20.LocalSandbox, "function");
    assert.equal(typeof module21.FileRunStorage, "function");
    assert.equal(typeof module22.PostgresSessionStorage, "function");
    assert.equal(typeof module23.BashTool, "function");

    class TestMode extends HarnessMode {
      prompt = "Answer with ok.";
    }

    const mode = new TestMode();
    const provider = {
      namespace: "fake",
      async run(input) {
        assert.equal(input.modelRef, "fake/model");
        return { content: "ok" };
      },
    };

    const store = await createHarnessSessionStore({
      agent: {
        definition: defineAgent({
          key: "consumer-smoke",
          label: "Consumer Smoke",
          initialMode: mode,
          modes: [mode],
        }),
      },
      providers: [provider],
      defaultModel: "fake/model",
      storage: new MemorySessionStorage(),
      sandbox: new NoopSandbox(),
    });

    const result = await store.send("consumer", "hello from external consumer");
    assert.equal(result.answer, "ok");
    await store.close();
  `;

  const smokePath = join(consumerDir, "smoke.mjs");
  writeFileSync(smokePath, smokeSource, "utf8");
  run(process.execPath, [smokePath], { cwd: consumerDir });
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
