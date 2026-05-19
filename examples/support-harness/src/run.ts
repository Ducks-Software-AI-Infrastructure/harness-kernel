import "dotenv/config";

import { resolve } from "node:path";
import { ConsoleLogSink } from "@harness-kernel/core/runner/logging";
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { LocalSandbox } from "@harness-kernel/sandbox-local";
import { FileSessionStorage } from "@harness-kernel/storage-file";
import { agent } from "./agent.js";

const message = process.argv.slice(2).join(" ").trim() || "A customer cannot access billing settings.";
for (const mode of agent.modes) mode.toolApproval = "ask";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: process.env.HARNESS_KERNEL_MODEL ?? "openai/gpt-5.1-mini",
  storage: new FileSessionStorage(),
  sandbox: new LocalSandbox({ workDir: resolve(process.cwd()) }),
  logging: {
    sinks: [new ConsoleLogSink({ level: "info" })],
  },
  errorPolicy: {
    retry: { model: { attempts: 2, backoffMs: 500 } },
  },
});

try {
  const result = await store.send("support-example", message);
  console.log(result.answer);
} catch (error) {
  const status = store.get("support-example")?.getStatus();
  if (status?.lastError) console.error(`[error:${status.lastError.code}] ${status.lastError.message}`);
  throw error;
} finally {
  await store.close();
}
