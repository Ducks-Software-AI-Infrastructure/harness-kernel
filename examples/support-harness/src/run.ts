import "dotenv/config";

import { resolve } from "node:path";
import { ConsoleLogSink } from "@harness-kernel/core/runner/logging";
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { LocalSandbox } from "@harness-kernel/sandbox-local";
import { FileRunStorage } from "@harness-kernel/storage-file";
import { agent } from "./agent.js";

const message = process.argv.slice(2).join(" ").trim() || "A customer cannot access billing settings.";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: process.env.HARNESS_KERNEL_MODEL ?? "openai/gpt-5.1-mini",
  workDir: resolve(process.cwd()),
  storage: new FileRunStorage({ outputDir: ".harness-kernel/runs" }),
  sandbox: new LocalSandbox(),
  toolApproval: "ask",
  logging: {
    sinks: [new ConsoleLogSink({ level: "info" })],
  },
});

try {
  const result = await store.send("support-example", message);
  console.log(result.answer);
} finally {
  await store.close();
}
