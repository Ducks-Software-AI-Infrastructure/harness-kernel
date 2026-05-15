import { dirname } from "node:path";
import type { AgentActionSession } from "@harness-kernel/core";
import type { SandboxExecResult } from "@harness-kernel/core";
import { assertSafeRelativePath, assertSafeRelativePattern, shellQuote } from "./path.js";

export class SandboxFileSystem {
  constructor(private readonly session: AgentActionSession) {}

  read(path: string, maxBytes = 500_000): Promise<SandboxExecResult> {
    assertSafeRelativePath(path);
    return this.session.sandbox.exec({
      command: `head -c ${maxBytes} -- ${shellQuote(path)}`,
    });
  }

  readAll(path: string): Promise<SandboxExecResult> {
    assertSafeRelativePath(path);
    return this.session.sandbox.exec({
      command: `cat -- ${shellQuote(path)}`,
    });
  }

  write(path: string, content: string, append = false): Promise<SandboxExecResult> {
    assertSafeRelativePath(path);
    const parent = dirname(path) || ".";
    const operator = append ? ">>" : ">";
    return this.session.sandbox.exec({
      command: `mkdir -p -- ${shellQuote(parent)} && cat ${operator} ${shellQuote(path)}`,
      stdin: content,
    });
  }

  listFiles(limit: number): Promise<SandboxExecResult> {
    return this.session.sandbox.exec({
      command: [
        "find . -type f",
        "! -path './node_modules/*'",
        "! -path './.git/*'",
        "! -path './.harness-kernel/*'",
        "-print",
        "| sed 's#^./##'",
        `| head -n ${Math.max(1, limit)}`,
      ].join(" "),
    });
  }

  grep(input: {
    pattern: string;
    path: string;
    regex: boolean;
    maxResults: number;
  }): Promise<SandboxExecResult> {
    assertSafeRelativePath(input.path);
    const mode = input.regex ? "-RInIE" : "-RInIF";
    const command = [
      "set +e;",
      `grep ${mode} --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.harness-kernel -- ${shellQuote(input.pattern)} ${shellQuote(input.path)} | head -n ${input.maxResults};`,
      "status=${PIPESTATUS[0]};",
      "if [ \"$status\" -eq 0 ] || [ \"$status\" -eq 1 ]; then exit 0; fi;",
      "exit \"$status\"",
    ].join(" ");
    return this.session.sandbox.exec({ command });
  }

  assertPattern(pattern: string): void {
    assertSafeRelativePattern(pattern);
  }
}
