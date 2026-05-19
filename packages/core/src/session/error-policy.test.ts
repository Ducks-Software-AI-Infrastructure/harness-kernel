import assert from "node:assert/strict";
import {
  createHarnessSession,
  defineAgent,
  HarnessContextProvider,
  HarnessMode,
  HarnessTool,
  RunAbortedEvent,
  RunFailedEvent,
  s,
  type AgentActionSession,
  type HarnessModelProvider,
} from "../index.js";
import { MemoryLogSink } from "../logging/index.js";

class ChatMode extends HarnessMode {
  prompt = "Reply.";
  maxTurns = 2;
}

const chatMode = new ChatMode();
const chatAgent = defineAgent({
  key: "error-policy-chat",
  label: "Error Policy Chat",
  initialMode: chatMode,
  modes: [chatMode],
});

const failingProvider: HarnessModelProvider = {
  namespace: "fake",
  async run() {
    throw new Error("provider exploded");
  },
};

const logs = new MemoryLogSink();
const failingSession = await createHarnessSession({
  agent: { definition: chatAgent },
  providers: [failingProvider],
  defaultModel: "fake/model",
  logging: { level: "debug", sinks: [logs] },
});

try {
  const stream = failingSession.stream("fail");
  const resultError = stream.result.catch((error: unknown) => error);
  const streamEvents: string[] = [];
  let failedCode: string | undefined;
  let errorCode: string | undefined;

  for await (const event of stream) {
    streamEvents.push(event.type);
    if (event.type === "run.failed") failedCode = event.error.code;
    if (event.type === "error") errorCode = event.error.code;
  }

  const rejected = await resultError;
  assert.match(rejected instanceof Error ? rejected.message : String(rejected), /provider exploded/);
  assert.equal(failedCode, "model.failed");
  assert.equal(errorCode, "model.failed");
  assert.equal(streamEvents.includes("run.failed"), true);
  assert.equal(failingSession.getStatus().phase, "error");
  assert.equal(failingSession.getStatus().lastError?.code, "model.failed");
  assert.equal(failingSession.getEvents({ event: RunFailedEvent }).length, 1);
  assert.equal(failingSession.getStatus().metrics?.errors.at(-1)?.code, "model.failed");
  assert.equal(logs.records.some((record) => record.type === "RunFailedLog" && record.error?.code === "model.failed"), true);
} finally {
  await failingSession.close();
}

class RequiredContext extends HarnessContextProvider {
  required = true;
  render() {
    throw new Error("required context failed");
  }
}

const requiredProvider = new RequiredContext();
const requiredMode = new class RequiredMode extends HarnessMode {
  prompt = "Use context.";
  providers = [requiredProvider];
}();
const requiredAgent = defineAgent({
  key: "required-context",
  label: "Required Context",
  initialMode: requiredMode,
  modes: [requiredMode],
});

const echoProvider: HarnessModelProvider = {
  namespace: "fake",
  async run() {
    return { content: "ok" };
  },
};

const requiredSession = await createHarnessSession({
  agent: { definition: requiredAgent },
  providers: [echoProvider],
  defaultModel: "fake/model",
});

try {
  await assert.rejects(requiredSession.send("go"), /required context failed/);
  assert.equal(requiredSession.getStatus().lastError?.code, "context.provider.failed");
} finally {
  await requiredSession.close();
}

class OptionalContext extends HarnessContextProvider {
  required = false;
  render() {
    throw new Error("optional context failed");
  }
}

const optionalProvider = new OptionalContext();
const optionalMode = new class OptionalMode extends HarnessMode {
  prompt = "Use optional context.";
  providers = [optionalProvider];
}();
const optionalAgent = defineAgent({
  key: "optional-context",
  label: "Optional Context",
  initialMode: optionalMode,
  modes: [optionalMode],
});
const optionalSession = await createHarnessSession({
  agent: { definition: optionalAgent },
  providers: [echoProvider],
  defaultModel: "fake/model",
  errorPolicy: { contextFailure: "warn-and-skip" },
});

try {
  const result = await optionalSession.send("go");
  assert.equal(result.answer, "ok");
  assert.equal(result.metrics.errors.at(-1)?.code, "context.provider.failed");
} finally {
  await optionalSession.close();
}

class ExplodingTool extends HarnessTool<{ value: string }> {
  name = "explode";
  description = "Explodes.";
  schema = s.object({ value: s.string() });

  execute(_args: { value: string }, _session: AgentActionSession) {
    throw new Error("tool exploded");
  }
}

const explodingTool = new ExplodingTool();
const toolMode = new class ToolMode extends HarnessMode {
  prompt = "Use tool.";
  tools = [explodingTool];
}();
const toolAgent = defineAgent({
  key: "tool-error",
  label: "Tool Error",
  initialMode: toolMode,
  modes: [toolMode],
});
const toolProvider: HarnessModelProvider = {
  namespace: "fake",
  async run(input) {
    const result = await input.executeTool(input.tools[0]!, { value: "x" }, "call-1");
    assert.equal(result.isError, true);
    assert.equal(result.metadata?.errorCode, "tool.failed");
    return { content: String(result.metadata?.errorCode) };
  },
};
const toolSession = await createHarnessSession({
  agent: { definition: toolAgent },
  providers: [toolProvider],
  defaultModel: "fake/model",
});

try {
  const result = await toolSession.send("go");
  assert.equal(result.answer, "tool.failed");
  assert.equal(result.events.some((event) =>
    event.type === "error"
    && (event.payload as { error?: { code?: string; recoverable?: boolean } }).error?.code === "tool.failed"
    && (event.payload as { error?: { code?: string; recoverable?: boolean } }).error?.recoverable === true
  ), true);
  assert.equal(toolSession.getStatus().phase, "idle");
} finally {
  await toolSession.close();
}

const invalidToolProvider: HarnessModelProvider = {
  namespace: "fake",
  async run(input) {
    const result = await input.executeTool(input.tools[0]!, { value: 1 }, "call-invalid");
    assert.equal(result.isError, true);
    assert.equal(result.metadata?.errorCode, "tool.args.invalid_schema");
    assert.equal(Array.isArray((result.data as { error?: { invalidFields?: unknown[] } }).error?.invalidFields), true);
    return { content: String(result.metadata?.errorCode) };
  },
};
const invalidToolSession = await createHarnessSession({
  agent: { definition: toolAgent },
  providers: [invalidToolProvider],
  defaultModel: "fake/model",
});

try {
  const result = await invalidToolSession.send("invalid");
  assert.equal(result.answer, "tool.args.invalid_schema");
  assert.equal(result.metrics.errors.at(-1)?.code, "tool.args.invalid_schema");
  assert.equal(result.events.some((event) =>
    event.type === "error"
    && (event.payload as { error?: { code?: string } }).error?.code === "tool.args.invalid_schema"
  ), true);
} finally {
  await invalidToolSession.close();
}

let retryCalls = 0;
const retryProvider: HarnessModelProvider = {
  namespace: "fake",
  async run() {
    retryCalls++;
    if (retryCalls === 1) throw Object.assign(new Error("too many requests"), { status: 429 });
    return { content: "retried" };
  },
};
const retrySession = await createHarnessSession({
  agent: { definition: chatAgent },
  providers: [retryProvider],
  defaultModel: "fake/model",
  errorPolicy: { retry: { model: { attempts: 2, backoffMs: 1 } } },
});

try {
  const result = await retrySession.send("retry");
  assert.equal(result.answer, "retried");
  assert.equal(retryCalls, 2);
} finally {
  await retrySession.close();
}

const abortProvider: HarnessModelProvider = {
  namespace: "fake",
  async run(input) {
    await new Promise((_resolve, reject) => {
      input.signal?.addEventListener("abort", () => reject(new Error("Run aborted.")), { once: true });
    });
    return { content: "never" };
  },
};
const abortSession = await createHarnessSession({
  agent: { definition: chatAgent },
  providers: [abortProvider],
  defaultModel: "fake/model",
});

try {
  const stream = abortSession.stream("abort");
  const resultError = stream.result.catch((error: unknown) => error);
  let sawAbort = false;
  for await (const event of stream) {
    if (event.type === "run.started") await stream.cancel("test");
    if (event.type === "run.aborted") {
      sawAbort = true;
      assert.equal(event.error.code, "run.aborted");
      assert.equal(event.error.severity, "warn");
    }
  }
  const rejected = await resultError;
  assert.match(rejected instanceof Error ? rejected.message : String(rejected), /Run aborted/);
  assert.equal(sawAbort, true);
  assert.equal(abortSession.getEvents({ event: RunAbortedEvent }).length, 1);
} finally {
  await abortSession.close();
}

const closingSession = await createHarnessSession({
  agent: { definition: chatAgent },
  providers: [failingProvider],
  defaultModel: "fake/model",
  errorPolicy: { closeSessionOnFatal: true },
});

try {
  await assert.rejects(closingSession.send("fail"), /provider exploded/);
  assert.equal(closingSession.getStatus().phase, "closed");
  await assert.rejects(closingSession.send("again"), /closed/);
} finally {
  await closingSession.close();
}
