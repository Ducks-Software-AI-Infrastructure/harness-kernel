import "dotenv/config";

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConsoleLogSink } from "@harness-kernel/core/runner/logging";
import { createHarnessSessionStore, type HarnessSessionStore } from "@harness-kernel/core/runner";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { LocalSandbox } from "@harness-kernel/sandbox-local";
import { FileRunStorage } from "@harness-kernel/storage-file";
import { agent } from "./agent.js";

interface MessageRequest {
  sessionId?: string;
  message?: string;
}

async function readJson(req: IncomingMessage): Promise<MessageRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as MessageRequest;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function createWebHarnessStore(): Promise<HarnessSessionStore> {
  return createHarnessSessionStore({
    agent: { definition: agent },
    providers: [new OpenAIProvider()],
    defaultModel: process.env.HARNESS_KERNEL_MODEL ?? "openai/gpt-5.1-mini",
    workDir: resolve(process.cwd()),
    storage: new FileRunStorage({ outputDir: ".harness-kernel/runs" }),
    sandbox: new LocalSandbox(),
    toolApproval: "deny",
    logging: {
      sinks: [new ConsoleLogSink({ level: "warn" })],
    },
  });
}

export function createWebHarnessServer(storePromise: Promise<HarnessSessionStore> = createWebHarnessStore()) {
  return createHttpServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        writeJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && req.url === "/message") {
        const body = await readJson(req);
        if (!body.message?.trim()) {
          writeJson(res, 400, { error: "message is required" });
          return;
        }

        const store = await storePromise;
        const result = await store.send(body.sessionId ?? "web-example", body.message);
        writeJson(res, 200, { sessionId: result.sessionId, answer: result.answer });
        return;
      }

      writeJson(res, 404, { error: "not found" });
    } catch (error) {
      writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3030);
  const server = createWebHarnessServer();
  server.listen(port, () => {
    console.log(`Web harness listening on http://localhost:${port}`);
  });
}
