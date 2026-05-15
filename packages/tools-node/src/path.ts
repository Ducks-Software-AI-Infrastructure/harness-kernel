import { isAbsolute, normalize, relative, resolve } from "node:path";

export function resolveInsideWorkDir(workDir: string, inputPath: string): string {
  assertSafeRelativePath(inputPath);
  const fullPath = resolve(workDir, inputPath);
  const rel = relative(workDir, fullPath);
  if (rel.startsWith("..") || rel === ".." || rel.includes(`..${"/"}`) || rel.includes(`..${"\\"}`)) {
    throw new Error(`Path escapes workDir: ${inputPath}`);
  }
  return fullPath;
}

export function normalizeRelativePath(workDir: string, fullPath: string): string {
  return relative(workDir, fullPath) || ".";
}

export function assertSafeRelativePath(inputPath: string): void {
  if (!inputPath.trim()) throw new Error("Path must not be empty.");
  if (isAbsolute(inputPath)) throw new Error(`Absolute paths are not allowed: ${inputPath}`);
  if (inputPath.split(/[\\/]+/u).includes("..")) throw new Error(`Path escapes workDir: ${inputPath}`);
  const normalized = normalize(inputPath).replace(/\\/g, "/");
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Path escapes workDir: ${inputPath}`);
  }
}

export function assertSafeRelativePattern(pattern: string): void {
  if (!pattern.trim()) throw new Error("Path pattern must not be empty.");
  if (isAbsolute(pattern)) throw new Error(`Absolute paths are not allowed: ${pattern}`);
  if (pattern.split(/[\\/]+/u).includes("..")) throw new Error(`Path pattern escapes workDir: ${pattern}`);
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
