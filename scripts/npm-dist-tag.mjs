const version = process.argv[2];

if (!version) {
  throw new Error("Usage: node scripts/npm-dist-tag.mjs <version>");
}

if (/^\d+\.\d+\.\d+$/.test(version)) {
  console.log("latest");
  process.exit(0);
}

const prerelease = version.match(
  /^\d+\.\d+\.\d+-(alpha|beta|rc)(?:[.-]\d+)?(?:\.[0-9A-Za-z-]+)*$/,
);

if (!prerelease) {
  throw new Error(`Unsupported prerelease version for npm dist-tag: ${version}`);
}

console.log(prerelease[1]);
