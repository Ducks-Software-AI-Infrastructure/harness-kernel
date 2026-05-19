import { config as loadEnv } from "dotenv";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import type { ToolApprovalHandle, ToolApprovalMode } from "@harness-kernel/core/runner/approval";
import { ConsoleLogSink } from "@harness-kernel/core/runner/logging";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { LocalSandbox } from "@harness-kernel/sandbox-local";
import { FileSessionStorage } from "@harness-kernel/storage-file";
import agent from "./agent.js";

loadEnv();

type ParsedArgs = {
  message: string;
  toolApproval?: ToolApprovalMode;
};

function usage(): never {
  throw new Error("Usage: npm run run -- [--auto-approve|--ask-tools|--deny-tools] [message]");
}

function parseArgs(args: string[]): ParsedArgs {
  let toolApproval: ParsedArgs["toolApproval"];
  const rest: string[] = [];
  for (const arg of args) {
    if (arg === "--auto-approve") toolApproval = "auto";
    else if (arg === "--ask-tools") toolApproval = "ask";
    else if (arg === "--deny-tools") toolApproval = "deny";
    else if (arg === "--help" || arg === "-h") usage();
    else rest.push(arg);
  }
  return {
    message: rest.join(" ").trim() || "Hello",
    toolApproval,
  };
}

async function askApproval(approval: ToolApprovalHandle): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`Approve tool ${approval.name}? [y/N] `);
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

function logLevel(): "silent" | "error" | "warn" | "info" | "debug" {
  if (!process.env.HARNESS_KERNEL_LOG_LEVEL && logModelDeltas() !== "none") return "info";
  const value = process.env.HARNESS_KERNEL_LOG_LEVEL ?? "warn";
  return value === "silent" || value === "error" || value === "warn" || value === "info" || value === "debug"
    ? value
    : "warn";
}

function logModelDeltas(): "none" | "summary" | "full" {
  const value = process.env.HARNESS_KERNEL_LOG_DELTAS;
  if (value === "true" || value === "full") return "full";
  if (value === "summary") return "summary";
  return "none";
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const model = process.env.HARNESS_KERNEL_MODEL ?? "openai/gpt-5.1";
  const rootDir = process.env.HARNESS_KERNEL_OUTPUT_DIR ?? ".harness-kernel";
  for (const mode of agent.modes) mode.toolApproval = parsed.toolApproval ?? "tool-default";
  const store = await createHarnessSessionStore({
    agent: { definition: agent },
    providers: [new OpenAIProvider()],
    defaultModel: model,
    storage: new FileSessionStorage({ rootDir }),
    sandbox: new LocalSandbox({ workDir: resolve(process.cwd(), process.env.HARNESS_KERNEL_WORKDIR ?? ".") }),
    logging: {
      level: logLevel(),
      modelDeltas: logModelDeltas(),
      sinks: [new ConsoleLogSink({ format: process.env.HARNESS_KERNEL_LOG_FORMAT === "json" ? "json" : "pretty" })],
    },
    errorPolicy: {
      exposeInternalErrors: process.env.NODE_ENV !== "production",
      retry: { model: { attempts: 2, backoffMs: 500 } },
    },
  });

  const session = await store.getOrCreate();
  const stream = session.stream(parsed.message);
  for await (const event of stream) {
    if (event.type === "assistant.delta") {
      process.stdout.write(event.text);
    } else if (event.type === "tool.started") {
      process.stderr.write(`\n[tool:start] ${event.name}\n`);
    } else if (event.type === "tool.ended") {
      process.stderr.write(`[tool:end] ${event.name}\n`);
    } else if (event.type === "tool.approval.requested") {
      if (await askApproval(event.approval)) await event.approval.approve();
      else await event.approval.deny();
    } else if (event.type === "run.failed" || event.type === "run.aborted") {
      process.stderr.write(`[run:${event.error.code}] ${event.error.message}\n`);
    } else if (event.type === "error") {
      process.stderr.write(`[error:${event.error.code}] ${event.error.message}\n`);
    }
  }

  const result = await stream.result;
  process.stdout.write("\n");
  process.stderr.write(`[run] output: ${result.outputDir ?? "storage disabled"}\n`);
  await store.close();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
