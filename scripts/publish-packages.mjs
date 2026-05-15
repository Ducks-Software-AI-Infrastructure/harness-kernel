#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const tagIndex = args.indexOf("--tag");
const tag = tagIndex === -1 ? undefined : args[tagIndex + 1];

if (!tag) {
  console.error("Usage: node scripts/publish-packages.mjs --tag <dist-tag> [--dry-run]");
  process.exit(1);
}

const packagesDir = "packages";
const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const dir = join(packagesDir, entry.name);
    const packageJsonPath = join(dir, "package.json");
    if (!existsSync(packageJsonPath)) {
      return undefined;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    return {
      dir,
      name: packageJson.name,
      version: packageJson.version,
      dependencies: {
        ...packageJson.dependencies,
        ...packageJson.peerDependencies,
        ...packageJson.optionalDependencies,
        ...packageJson.devDependencies,
      },
    };
  })
  .filter(Boolean);

const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
const ordered = [];
const visiting = new Set();
const visited = new Set();

function visit(pkg) {
  if (visited.has(pkg.name)) {
    return;
  }

  if (visiting.has(pkg.name)) {
    throw new Error(`Circular package dependency involving ${pkg.name}`);
  }

  visiting.add(pkg.name);

  for (const dependencyName of Object.keys(pkg.dependencies ?? {})) {
    const dependency = byName.get(dependencyName);
    if (dependency) {
      visit(dependency);
    }
  }

  visiting.delete(pkg.name);
  visited.add(pkg.name);
  ordered.push(pkg);
}

for (const pkg of packages) {
  visit(pkg);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    shell: false,
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function versionExists(pkg) {
  const result = run("npm", ["view", `${pkg.name}@${pkg.version}`, "version", "--json"], {
    capture: true,
  });

  if (result.status === 0) {
    return true;
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (output.includes("E404") || output.includes("404 Not Found")) {
    return false;
  }

  console.error(output.trim());
  throw new Error(`Unable to check published version for ${pkg.name}@${pkg.version}`);
}

for (const pkg of ordered) {
  if (versionExists(pkg)) {
    console.log(`Skipping ${pkg.name}@${pkg.version}; version already exists on npm.`);
    continue;
  }

  const publishArgs = ["publish", "--access", "public", "--tag", tag];
  if (dryRun) {
    publishArgs.push("--dry-run");
  }

  console.log(`${dryRun ? "Dry-running" : "Publishing"} ${pkg.name}@${pkg.version} with npm dist-tag ${tag}.`);
  const result = run("npm", publishArgs, { cwd: pkg.dir });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
