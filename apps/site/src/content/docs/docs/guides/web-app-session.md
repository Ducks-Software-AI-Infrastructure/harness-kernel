---
title: Web App Session
description: Use Harness Kernel from an HTTP server or web app backend.
---

Objective: keep a long-lived session store in a backend and send messages by session id.

```ts
import { createServer } from "node:http";
import { createHarnessSessionStore } from "@harness-kernel/core/runner";
import { OpenAIProvider } from "@harness-kernel/provider-openai";
import { agent } from "./agent.js";

const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [new OpenAIProvider()],
  defaultModel: process.env.HARNESS_KERNEL_MODEL ?? "openai/gpt-5.1-mini",
  toolApproval: "deny",
});

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/message") {
    res.writeHead(404).end();
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

  const result = await store.send(body.sessionId ?? "web", body.message);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ sessionId: result.sessionId, answer: result.answer }));
});

server.listen(3030);
```

The repo includes a more complete example under `examples/web-harness`.

Boundary note: the web app owns session ids, request auth, provider credentials, approval UI, persistence, and response shape.

API: [Sessions](../../runtime/sessions/) and [Streaming](../../runtime/streaming/).
