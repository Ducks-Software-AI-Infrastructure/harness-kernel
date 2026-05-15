import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { packageName } from "./index.js";

assert.equal(packageName, "@harness-kernel/create");

const templatesRoot = new URL("../templates", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const templateFiles = files(templatesRoot);
for (const file of templateFiles.filter((path) => /\.(ts|json|md|example)$/.test(path))) {
  const content = readFileSync(file, "utf8");
  assert.equal(content.includes("ducks-harness"), false, `${file} references the old package name.`);
  assert.equal(content.includes("Ducks Harness"), false, `${file} references the old product name.`);
  assert.equal(content.includes(".ducks-harness"), false, `${file} references the old output directory.`);
  assert.equal(content.includes("from \"harness-kernel\""), false, `${file} imports the removed runtime default package.`);
  assert.equal(content.includes("createDefaultHarnessSession"), false, `${file} references a removed default factory.`);
}

function readTemplatePackage(kind: "full" | "one-file"): { dependencies: Record<string, string> } {
  return JSON.parse(readFileSync(join(templatesRoot, kind, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
}

function expectedHarnessDependencyRange(version: string): string {
  return version.match(/^\d+\.\d+\.\d+-(alpha|beta|rc)(?:[.-]\d+)?(?:\.[0-9A-Za-z-]+)*$/u)?.[1] ?? "latest";
}

const fullPackage = readTemplatePackage("full");
const oneFilePackage = readTemplatePackage("one-file");

for (const dependency of [
  "@harness-kernel/core",
  "@harness-kernel/provider-openai",
  "@harness-kernel/storage-file",
  "@harness-kernel/sandbox-local",
]) {
  assert.equal(typeof oneFilePackage.dependencies[dependency], "string", `one-file template is missing ${dependency}.`);
}

for (const dependency of [
  "@harness-kernel/core",
  "@harness-kernel/provider-openai",
  "@harness-kernel/storage-file",
  "@harness-kernel/sandbox-local",
  "@harness-kernel/tools-node",
]) {
  assert.equal(typeof fullPackage.dependencies[dependency], "string", `full template is missing ${dependency}.`);
}

const packageRoot = resolve(templatesRoot, "..");
const createPackage = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as { version: string };
const workspaceRoot = resolve(packageRoot, "..", "..");
const tsxBin = join(workspaceRoot, "node_modules", ".bin", "tsx");
const cliSource = join(packageRoot, "src", "cli", "index.ts");
const tempDir = mkdtempSync(join(tmpdir(), "harness-kernel-create-"));
try {
  const result = spawnSync(tsxBin, [cliSource], {
    cwd: tempDir,
    input: "one-file\ninteractive-agent\n",
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const generatedPackage = JSON.parse(readFileSync(join(tempDir, "interactive-agent", "package.json"), "utf8")) as {
    name: string;
    dependencies: Record<string, string>;
  };
  const generatedAgent = readFileSync(join(tempDir, "interactive-agent", "agent.ts"), "utf8");
  assert.equal(generatedPackage.name, "interactive-agent");
  assert.equal(
    generatedPackage.dependencies["@harness-kernel/core"],
    expectedHarnessDependencyRange(createPackage.version),
  );
  assert.equal(generatedAgent.includes('key: "interactive-agent"'), true);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
