import { createToolErrorResult } from "@harness-kernel/core";
import { HarnessTool, s, type InferInput } from "@harness-kernel/core";
import type { AgentActionSession, AgentToolResult } from "@harness-kernel/core";
import { assertSafeRelativePath } from "./path.js";
import { SandboxFileSystem } from "./sandbox-file-system.js";
import { sandboxExecFailed, sandboxExecThrown, sandboxResultFailed } from "./sandbox-result.js";

const readFileSchema = s.object({
  path: s.string(),
  maxBytes: s.number().int().positive().max(1_000_000).optional(),
});

const writeFileSchema = s.object({
  path: s.string(),
  content: s.string(),
  append: s.boolean().optional(),
});

const editFileSchema = s.object({
  path: s.string(),
  search: s.string().min(1),
  replace: s.string(),
  expectedReplacements: s.number().int().positive().optional(),
});

const globSchema = s.object({
  pattern: s.string().default("**/*"),
  maxResults: s.number().int().positive().max(1000).default(200),
});

const grepSchema = s.object({
  pattern: s.string().min(1),
  path: s.string().default("."),
  regex: s.boolean().default(false),
  maxResults: s.number().int().positive().max(1000).default(200),
});

type ReadFileInput = InferInput<typeof readFileSchema>;
type WriteFileInput = InferInput<typeof writeFileSchema>;
type EditFileInput = InferInput<typeof editFileSchema>;
type GlobInput = InferInput<typeof globSchema>;
type GrepInput = InferInput<typeof grepSchema>;

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, "/");
  let out = "^";
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    const afterNext = normalized[i + 2];
    if (ch === "*" && next === "*" && afterNext === "/") {
      out += "(?:.*/)?";
      i += 2;
    } else if (ch === "*" && next === "*") {
      out += ".*";
      i++;
    } else if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  out += "$";
  return new RegExp(out);
}

function toolFailure(toolName: string, message: string, metadata?: Record<string, unknown>): AgentToolResult {
  return createToolErrorResult({
    code: "tool.failed",
    message,
    toolName,
    metadata,
  });
}

function normalizeFindOutput(stdout: string): string[] {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\.\//u, ""));
}

export class ReadFileTool extends HarnessTool<ReadFileInput> {
  name = "read_file";
  description = "Read a UTF-8 text file inside the harness workDir.";
  schema = readFileSchema;
  risk = "read" as const;
  permissions = [{ kind: "filesystem" as const, access: "read" as const, path: "." }];

  async execute(args: ReadFileInput, session: AgentActionSession): Promise<AgentToolResult> {
    const input = readFileSchema.parse(args);
    try {
      assertSafeRelativePath(input.path);
      const maxBytes = input.maxBytes ?? 500_000;
      const result = await new SandboxFileSystem(session).read(input.path, maxBytes);
      if (sandboxResultFailed(result)) return sandboxExecFailed(this.name, result);
      return {
        content: result.stdout,
        refs: [{ kind: "file", path: input.path, role: "read" }],
        metadata: { bytes: Buffer.byteLength(result.stdout) },
      };
    } catch (error) {
      return sandboxExecThrown(this.name, error);
    }
  }
}

export class WriteFileTool extends HarnessTool<WriteFileInput> {
  name = "write_file";
  description = "Write or append a UTF-8 text file inside the harness workDir.";
  schema = writeFileSchema;
  risk = "write" as const;
  requiresApproval = true;
  permissions = [{ kind: "filesystem" as const, access: "write" as const, path: "." }];

  async execute(args: WriteFileInput, session: AgentActionSession): Promise<AgentToolResult> {
    const input = writeFileSchema.parse(args);
    try {
      assertSafeRelativePath(input.path);
      const result = await new SandboxFileSystem(session).write(input.path, input.content, input.append);
      if (sandboxResultFailed(result)) return sandboxExecFailed(this.name, result);
      return {
        content: `Wrote ${input.path}`,
        refs: [{ kind: "file", path: input.path, role: input.append ? "modified" : "created" }],
      };
    } catch (error) {
      return sandboxExecThrown(this.name, error);
    }
  }
}

export class EditFileTool extends HarnessTool<EditFileInput> {
  name = "edit_file";
  description = "Replace exact text in a UTF-8 file inside the harness workDir.";
  schema = editFileSchema;
  risk = "write" as const;
  requiresApproval = true;
  permissions = [{ kind: "filesystem" as const, access: "write" as const, path: "." }];

  async execute(args: EditFileInput, session: AgentActionSession): Promise<AgentToolResult> {
    const input = editFileSchema.parse(args);
    try {
      assertSafeRelativePath(input.path);
      const fs = new SandboxFileSystem(session);
      const read = await fs.readAll(input.path);
      if (sandboxResultFailed(read)) return sandboxExecFailed(this.name, read);

      const count = read.stdout.split(input.search).length - 1;
      if (count === 0) return toolFailure(this.name, `Search text not found in ${input.path}`);
      if (input.expectedReplacements !== undefined && count !== input.expectedReplacements) {
        return toolFailure(this.name, `Expected ${input.expectedReplacements} replacement(s), found ${count}.`, {
          replacements: count,
        });
      }

      const next = read.stdout.split(input.search).join(input.replace);
      const write = await fs.write(input.path, next);
      if (sandboxResultFailed(write)) return sandboxExecFailed(this.name, write);
      return {
        content: `Edited ${input.path}; replacements=${count}`,
        refs: [{ kind: "file", path: input.path, role: "modified" }],
        metadata: { replacements: count },
      };
    } catch (error) {
      return sandboxExecThrown(this.name, error);
    }
  }
}

export class GlobTool extends HarnessTool<GlobInput, { files: string[] }> {
  name = "glob";
  description = "List files under workDir matching a simple glob pattern such as '**/*.ts'.";
  schema = globSchema;
  risk = "read" as const;
  permissions = [{ kind: "filesystem" as const, access: "read" as const, path: "." }];

  async execute(args: GlobInput, session: AgentActionSession): Promise<AgentToolResult<{ files: string[] }>> {
    const input = globSchema.parse(args);
    try {
      const fs = new SandboxFileSystem(session);
      fs.assertPattern(input.pattern);
      const result = await fs.listFiles(input.maxResults * 5);
      if (sandboxResultFailed(result)) return sandboxExecFailed(this.name, result) as AgentToolResult<{ files: string[] }>;
      const files = normalizeFindOutput(result.stdout);
      const re = globToRegExp(input.pattern);
      const matches = files.filter((file) => re.test(file)).slice(0, input.maxResults);
      return { content: matches.length ? matches.join("\n") : "No files found.", data: { files: matches } };
    } catch (error) {
      return sandboxExecThrown(this.name, error) as AgentToolResult<{ files: string[] }>;
    }
  }
}

export class GrepTool extends HarnessTool<GrepInput, { matches: string[] }> {
  name = "grep";
  description = "Search text files inside workDir using plain text or an extended grep RegExp.";
  schema = grepSchema;
  risk = "read" as const;
  permissions = [{ kind: "filesystem" as const, access: "read" as const, path: "." }];

  async execute(args: GrepInput, session: AgentActionSession): Promise<AgentToolResult<{ matches: string[] }>> {
    const input = grepSchema.parse(args);
    try {
      assertSafeRelativePath(input.path);
      const result = await new SandboxFileSystem(session).grep(input);
      if (sandboxResultFailed(result)) return sandboxExecFailed(this.name, result) as AgentToolResult<{ matches: string[] }>;
      const matches = result.stdout
        .split(/\r?\n/u)
        .map((line) => line.trimEnd().replace(/^\.\//u, ""))
        .filter(Boolean)
        .slice(0, input.maxResults);
      return { content: matches.length ? matches.join("\n") : "No matches found.", data: { matches } };
    } catch (error) {
      return sandboxExecThrown(this.name, error) as AgentToolResult<{ matches: string[] }>;
    }
  }
}

export function createReadFileTool(): ReadFileTool {
  return new ReadFileTool();
}

export function createWriteFileTool(): WriteFileTool {
  return new WriteFileTool();
}

export function createEditFileTool(): EditFileTool {
  return new EditFileTool();
}

export function createGlobTool(): GlobTool {
  return new GlobTool();
}

export function createGrepTool(): GrepTool {
  return new GrepTool();
}

export function createFileSystemTools(): HarnessTool[] {
  return [
    createReadFileTool(),
    createWriteFileTool(),
    createEditFileTool(),
    createGlobTool(),
    createGrepTool(),
  ];
}
