export {
  EditFileTool,
  GlobTool,
  GrepTool,
  ReadFileTool,
  WriteFileTool,
  createEditFileTool,
  createFileSystemTools,
  createGlobTool,
  createGrepTool,
  createReadFileTool,
  createWriteFileTool,
} from "./files.js";
export { BashTool, createBashTool } from "./bash.js";

import type { HarnessTool } from "@harness-kernel/core";
import { createBashTool } from "./bash.js";
import { createFileSystemTools } from "./files.js";

export function createCoreTools(): HarnessTool[] {
  return [...createFileSystemTools(), createBashTool()];
}
