import assert from "node:assert/strict";
import {
  createHarnessSessionStore,
  defineAgent,
  HarnessMode,
  MemorySessionStorage,
  type HarnessModelProvider,
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

const first = await session.send("hello");
assert.equal(first.answer, "answer:hello");
assert.equal(first.transcript.some((message) => message.role === "user" && message.content === "hello"), true);
assert.equal(session.snapshots.list().length > 0, true);
assert.ok(session.getContextSnapshot());

const activeList = await store.list({ active: true });
assert.deepEqual(activeList.items.map((item) => item.sessionId), ["session-a"]);

assert.equal(await store.close("session-a"), true);
assert.equal(store.get("session-a"), undefined);

const persistedList = await store.list();
assert.deepEqual(persistedList.items.map((item) => item.sessionId), ["session-a"]);

const reopened = await store.getOrCreate("session-a");
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
