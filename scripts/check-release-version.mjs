import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const expectedVersion = process.argv[2];

if (!expectedVersion) {
  throw new Error("Usage: node scripts/check-release-version.mjs <version>");
}

const packageDir = "packages";
const mismatches = [];

for (const name of readdirSync(packageDir)) {
  const packageJsonPath = join(packageDir, name, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (packageJson.private) continue;
  if (packageJson.version !== expectedVersion) {
    mismatches.push(`${packageJson.name}: ${packageJson.version}`);
  }
}

if (mismatches.length) {
  throw new Error(`Release tag version ${expectedVersion} does not match package versions:\n${mismatches.join("\n")}`);
}

console.log(`All public package versions match ${expectedVersion}.`);
