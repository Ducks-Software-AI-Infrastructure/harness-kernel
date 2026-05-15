#!/usr/bin/env node

import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

type TemplateKind = "one-file" | "full";

function usage(): never {
  throw new Error("Usage: create-harness-kernel [new] [one-file|full] [name]");
}

function titleFromName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function keyFromName(name: string): string {
  const key = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
  return key || "agent";
}

function replacePlaceholders(path: string, replacements: Record<string, string>): void {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) replacePlaceholders(join(path, entry), replacements);
    return;
  }
  const textExtensions = [".ts", ".json", ".md", ".example"];
  if (!textExtensions.some((extension) => path.endsWith(extension))) return;
  let content = readFileSync(path, "utf8");
  for (const [token, value] of Object.entries(replacements)) {
    content = content.split(token).join(value);
  }
  writeFileSync(path, content, "utf8");
}

function harnessDependencyRange(packageRoot: string): string {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as { version?: string };
  const version = String(packageJson.version ?? "");
  const prerelease = version.match(/^\d+\.\d+\.\d+-(alpha|beta|rc)(?:[.-]\d+)?(?:\.[0-9A-Za-z-]+)*$/u);
  return prerelease?.[1] ?? "latest";
}

function scaffold(kind: TemplateKind, name: string): void {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const templateDir = join(packageRoot, "templates", kind);
  if (!existsSync(templateDir)) throw new Error(`Template '${kind}' was not found.`);

  const target = resolve(process.cwd(), name);
  if (existsSync(target)) throw new Error(`Target already exists: ${target}`);
  cpSync(templateDir, target, { recursive: true });
  replacePlaceholders(target, {
    __PACKAGE__: name,
    __AGENT_ID__: keyFromName(name),
    __AGENT_LABEL__: titleFromName(name),
    __HARNESS_VERSION__: harnessDependencyRange(packageRoot),
  });
  console.log(`Created ${kind} Harness Kernel project at ${target}`);
}

function isTemplateKind(value: string | undefined): value is TemplateKind {
  return value === "one-file" || value === "full";
}

async function promptForMissing(kind: TemplateKind | undefined, name: string | undefined): Promise<{
  kind: TemplateKind;
  name: string;
}> {
  if ((!kind || !name) && !input.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of input) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const answers = Buffer.concat(chunks)
      .toString("utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);

    let nextKind = kind;
    if (!nextKind) {
      const answer = answers.shift() ?? "one-file";
      if (!isTemplateKind(answer)) throw new Error("Template must be 'one-file' or 'full'.");
      nextKind = answer;
    }

    const nextName = name?.trim() || answers.shift();
    if (!nextName) throw new Error("Project name is required.");
    return { kind: nextKind, name: nextName };
  }

  const rl = createInterface({ input, output });
  try {
    let nextKind = kind;
    while (!nextKind) {
      const answer = (await rl.question("Template (one-file/full) [one-file]: ")).trim() || "one-file";
      if (isTemplateKind(answer)) nextKind = answer;
      else output.write("Choose 'one-file' or 'full'.\n");
    }

    let nextName = name?.trim();
    while (!nextName) {
      nextName = (await rl.question("Project name: ")).trim();
      if (!nextName) output.write("Project name is required.\n");
    }

    return { kind: nextKind, name: nextName };
  } finally {
    rl.close();
  }
}

async function main(args: string[]): Promise<void> {
  const normalized = args[0] === "new" ? args.slice(1) : args;
  const kind = normalized[0];
  const name = normalized[1];
  if (kind !== undefined && !isTemplateKind(kind)) usage();
  if (normalized.length > 2) usage();
  const resolved = await promptForMissing(kind, name);
  scaffold(resolved.kind, resolved.name);
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
