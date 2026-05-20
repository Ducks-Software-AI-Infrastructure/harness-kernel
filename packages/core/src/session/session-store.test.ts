import assert from "node:assert/strict";
import {
  createHarnessSessionStore,
  defineAgent,
  HarnessSandbox,
  HarnessMode,
  MemorySessionStorage,
  type HarnessSandboxOpenInput,
  type HarnessSandboxSession,
  type HarnessModelProvider,
  type HarnessSession,
  type SandboxCloseInput,
  type SandboxDestroyInput,
} from "../index.js";
import { MemoryLogSink } from "../logging/index.js";

class ChatMode extends HarnessMode {
  prompt = "Reply with the latest user message.";
  maxTurns = 3;
}

const mode = new ChatMode();
const agent = defineAgent({
  key: "session-store-test",
  label: "Session Store Test",
  initialMode: mode,
  modes: [mode],
});

const provider: HarnessModelProvider = {
  namespace: "fake",
  async run(input) {
    const latest = input.messages.at(-1);
    return { content: `answer:${String(latest?.content ?? "")}` };
  },
};

function trackSession(store: unknown, sessionId: string, session: HarnessSession): void {
  (store as { sessions: Map<string, HarnessSession> }).sessions.set(sessionId, session);
}

function fakeSession(sessionId: string, closeInputs: (SandboxCloseInput | undefined)[]): HarnessSession {
  return {
    id: sessionId,
    async close(input?: SandboxCloseInput) {
      closeInputs.push(input);
    },
  } as HarnessSession;
}

async function seedStoredSession(storage: MemorySessionStorage, sessionId: string): Promise<void> {
  await storage.createSession({
    sessionId,
    agentKey: "session-store-test",
    mode: "ChatMode",
    createdAt: "2024-01-01T00:00:00.000Z",
    lastActiveAt: "2024-01-01T00:00:00.000Z",
  });
}

class DestroyTrackingSandbox extends HarnessSandbox {
  readonly id = "destroy-tracking";
  readonly destroyInputs: SandboxDestroyInput[] = [];

  open(_input: HarnessSandboxOpenInput): HarnessSandboxSession {
    throw new Error("DestroyTrackingSandbox should not open during this test.");
  }

  destroy(input: SandboxDestroyInput): void {
    this.destroyInputs.push(input);
  }
}

const storage = new MemorySessionStorage();
const logs = new MemoryLogSink();
const store = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [provider],
  defaultModel: "fake/model",
  storage,
  logging: { level: "info", sinks: [logs] },
});

const session = await store.getOrCreate("session-a");
assert.equal(store.get("session-a"), session);
const emptyActiveList = await store.list({ active: true });
assert.deepEqual(emptyActiveList.items.map((item) => item.sessionId), ["session-a"]);
assert.equal(emptyActiveList.items[0]?.latestRunId, undefined);

const first = await session.send("hello");
assert.equal(first.answer, "answer:hello");
assert.equal(first.transcript.some((message) => message.role === "user" && message.content === "hello"), true);
assert.equal(session.snapshots.list().length > 0, true);
assert.ok(session.getContextSnapshot());

const activeList = await store.list({ active: true });
assert.deepEqual(activeList.items.map((item) => item.sessionId), ["session-a"]);
assert.equal(activeList.items[0]?.latestRunId, first.runId);

assert.equal(await store.close("session-a"), true);
assert.equal(store.get("session-a"), undefined);

const persistedList = await store.list();
assert.deepEqual(persistedList.items.map((item) => item.sessionId), ["session-a"]);
assert.equal(persistedList.items[0]?.latestRunId, first.runId);

const reopened = await store.getOrCreate("session-a");
assert.equal((await store.list({ active: true })).items[0]?.latestRunId, first.runId);
assert.equal(reopened.transcript.get().some((message) => message.role === "user" && message.content === "hello"), true);
assert.equal(reopened.getEvents().some((event) => event.type === "run:end"), true);
assert.equal(reopened.snapshots.list().length > 0, true);
assert.ok(reopened.getContextSnapshot());

const second = await reopened.send("again");
assert.notEqual(second.runId, first.runId);
assert.equal(second.answer, "answer:again");
assert.equal(reopened.transcript.get().some((message) => message.role === "user" && message.content === "hello"), true);
assert.equal(reopened.transcript.get().some((message) => message.role === "user" && message.content === "again"), true);

await store.close("session-a");
assert.equal(await store.delete("session-a"), true);
assert.deepEqual((await store.list()).items, []);

storage.createSession({
  sessionId: "session-b",
  agentKey: "session-store-test",
  mode: "ChatMode",
  createdAt: "2024-01-01T00:00:00.000Z",
  lastActiveAt: "2024-01-03T00:00:00.000Z",
});
storage.createSession({
  sessionId: "session-c",
  agentKey: "session-store-test",
  mode: "ChatMode",
  createdAt: "2024-01-01T00:00:00.000Z",
  lastActiveAt: "2024-01-02T00:00:00.000Z",
});
storage.createSession({
  sessionId: "session-d",
  agentKey: "session-store-test",
  mode: "ChatMode",
  createdAt: "2024-01-01T00:00:00.000Z",
  lastActiveAt: "2024-01-02T00:00:00.000Z",
});

const page1 = await store.list({ limit: 2 });
assert.deepEqual(page1.items.map((item) => item.sessionId), ["session-b", "session-c"]);
const page2 = await store.list({ limit: 2, cursor: page1.nextCursor });
assert.deepEqual(page2.items.map((item) => item.sessionId), ["session-d"]);

const completedLog = logs.records.find((record) => record.type === "RunCompletedLog");
assert.ok(completedLog?.fields?.metrics);

await store.close();

const closeReasonStorage = new MemorySessionStorage();
await seedStoredSession(closeReasonStorage, "close-reason");
const closeReasonStore = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [provider],
  defaultModel: "fake/model",
  storage: closeReasonStorage,
});
const closeInputs: (SandboxCloseInput | undefined)[] = [];
trackSession(closeReasonStore, "close-reason", fakeSession("close-reason", closeInputs));
assert.equal(await closeReasonStore.close("close-reason"), true);
assert.deepEqual(closeInputs, [{ reason: "close" }]);
await closeReasonStore.close();

const deleteReasonStorage = new MemorySessionStorage();
await seedStoredSession(deleteReasonStorage, "delete-reason");
const deleteReasonStore = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [provider],
  defaultModel: "fake/model",
  storage: deleteReasonStorage,
});
const deleteInputs: (SandboxCloseInput | undefined)[] = [];
trackSession(deleteReasonStore, "delete-reason", fakeSession("delete-reason", deleteInputs));
assert.equal(await deleteReasonStore.delete("delete-reason"), true);
assert.deepEqual(deleteInputs, [{ reason: "delete" }]);
await deleteReasonStore.close();

const destroyStorage = new MemorySessionStorage();
await seedStoredSession(destroyStorage, "inactive-reason");
const destroySandbox = new DestroyTrackingSandbox();
const destroyStore = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [provider],
  defaultModel: "fake/model",
  storage: destroyStorage,
  sandbox: destroySandbox,
});
assert.equal(await destroyStore.delete("inactive-reason"), true);
assert.deepEqual(destroySandbox.destroyInputs, [{
  sessionId: "inactive-reason",
  agentKey: "session-store-test",
}]);
await destroyStore.close();

const rememberedStorage = new MemorySessionStorage();
const baseDestroySandbox = new DestroyTrackingSandbox();
const overrideDestroySandbox = new DestroyTrackingSandbox();
const rememberedStore = await createHarnessSessionStore({
  agent: { definition: agent },
  providers: [provider],
  defaultModel: "fake/model",
  storage: rememberedStorage,
  sandbox: baseDestroySandbox,
});
await rememberedStore.getOrCreate("remembered-override", { sandbox: overrideDestroySandbox });
assert.equal(await rememberedStore.close("remembered-override"), true);
assert.equal(await rememberedStore.delete("remembered-override"), true);
assert.deepEqual(overrideDestroySandbox.destroyInputs, [{
  sessionId: "remembered-override",
  agentKey: "session-store-test",
}]);
assert.deepEqual(baseDestroySandbox.destroyInputs, []);
await rememberedStore.close();
