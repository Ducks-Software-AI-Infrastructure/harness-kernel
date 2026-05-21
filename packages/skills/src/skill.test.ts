import assert from "node:assert/strict";
import {
  HarnessMode,
  HarnessTool,
  createHarnessSession,
  defineAgent,
  s,
  type AgentActionSession,
  type AgentReadSession,
  type AgentToolResult,
  type HarnessModelProvider,
} from "@harness-kernel/core";
import { MemoryLogSink } from "@harness-kernel/core/runner/logging";
import {
  SkillActivatedEvent,
  SkillRequiredEvent,
  activateSkill,
  createSkillActivationTool,
  createSkillGatedTools,
  createSkillKit,
  createSkillListTool,
  createSkillPromptProvider,
  createSkillRegistry,
  deactivateSkill,
  defineSkill,
  getSkillState,
  isSkillActive,
  listActiveSkills,
  listAvailableSkills,
  listInactiveSkills,
  setSkillState,
} from "./index.js";

const echoSchema = s.object({
  value: s.string().min(1),
});

class EchoTool extends HarnessTool<{ value: string }, { value: string }> {
  name = "skill_echo";
  description = "Echo a value.";
  schema = echoSchema;
  risk = "write" as const;
  permissions = [{ kind: "custom" as const, access: "write" as const, description: "test" }];
  requiresApproval = true;
  approvalTimeoutMs = 1234;
  calls: string[] = [];

  execute(args: { value: string }, session: AgentActionSession): AgentToolResult<{ value: string }> {
    this.calls.push(args.value);
    session.state.update({ echoed: args.value });
    return {
      content: `echo:${args.value}`,
      data: { value: args.value },
    };
  }
}

class OtherTool extends HarnessTool<{ value: string }, { value: string }> {
  name = "other_echo";
  description = "Echo another value.";
  schema = echoSchema;
  risk = "safe" as const;

  execute(args: { value: string }): AgentToolResult<{ value: string }> {
    return {
      content: `other:${args.value}`,
      data: { value: args.value },
    };
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createFakeActionSession(initialState: Record<string, unknown> = {}) {
  let state = clone(initialState);
  const events: Array<{ type?: string; payload: unknown }> = [];
  const logs: Array<{ level: string; category: string; message: string; fields: unknown }> = [];

  const session = {
    runId: "run-test",
    turnId: "turn-test",
    agentKey: "agent-test",
    workDir: "/tmp/harness-skills-test",
    resources: {},
    state: {
      get: () => clone(state),
      update: (patch: Partial<Record<string, unknown>>) => {
        state = { ...state, ...clone(patch) };
      },
      set: (next: Record<string, unknown>) => {
        state = clone(next);
      },
    },
    history: { get: () => [] },
    events: {
      query: () => [],
      emit: async (eventClass: { type?: string }, payload: unknown) => {
        events.push({ type: eventClass.type, payload: clone(payload) });
        return { payload };
      },
    },
    mode: {
      current: () => ({ type: "test", label: "Test" }),
      switch: async () => undefined,
    },
    context: {
      get: () => [],
      snapshot: () => undefined,
      add: async () => ({}),
      render: async () => [],
      remove: async () => false,
      clear: async () => 0,
    },
    log: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      emit: (logClass: new () => {
        level: string;
        category: string;
        levelFor?: (fields: never) => string;
        message(fields: never): string;
      }, fields: never) => {
        const log = new logClass();
        logs.push({
          level: log.levelFor?.(fields) ?? log.level,
          category: log.category,
          message: log.message(fields),
          fields: clone(fields),
        });
      },
    },
    sandbox: {},
    tools: { invoke: async () => ({ content: "" }) },
    messages: { enqueue: async () => undefined },
    snapshots: { create: async () => ({}) },
    toolCall: { id: "tool-call-test", name: "test_tool" },
    __events: events,
    __logs: logs,
  } as unknown as AgentActionSession & {
    __events: Array<{ type?: string; payload: unknown }>;
    __logs: Array<{ level: string; category: string; message: string; fields: unknown }>;
  };

  return session;
}

function contentOf(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.map(contentOf).join("\n");
  if (output && typeof output === "object" && "content" in output) {
    return String((output as { content: unknown }).content);
  }
  return "";
}

const echoTool = new EchoTool();
const reviewSkill = defineSkill({
  key: "review",
  description: "Review work before changing files.",
  prompt: "ACTIVE_REVIEW_PROMPT",
  tools: [echoTool],
  metadata: { area: "code" },
});
const docsSkill = defineSkill({
  key: "docs",
  description: "Read documentation first.",
  prompt: async (_session: AgentReadSession) => "ACTIVE_DOCS_PROMPT",
});

assert.throws(() => defineSkill({ key: " ", description: "bad" }), /Skill key must not be empty/);
assert.throws(() => defineSkill({ key: "x", description: "" }), /description must not be empty/);
assert.equal(defineSkill({ key: "github-pr-review", description: "Review PRs." }).label, "Github Pr Review");

assert.throws(() => createSkillRegistry([reviewSkill, reviewSkill]), /Duplicate skill key 'review'/);
assert.throws(
  () => createSkillRegistry([
    defineSkill({ key: "a", description: "A.", tools: [new EchoTool()] }),
    defineSkill({ key: "b", description: "B.", tools: [new EchoTool()] }),
  ]),
  /Duplicate skill tool name 'skill_echo' declared by skills 'a' and 'b'/,
);

const registry = createSkillRegistry([reviewSkill, docsSkill]);
assert.equal(registry.require("review").key, "review");
assert.throws(() => registry.require("missing"), /Unknown skill 'missing'/);
assert.equal(registry.tools()[0], echoTool);

const stateSession = createFakeActionSession({ other: 1 });
setSkillState(stateSession, {
  active: {
    review: {
      key: "review",
      activatedAt: "2026-01-01T00:00:00.000Z",
      reason: "test",
    },
  },
});
assert.equal(stateSession.state.get().other, 1);
assert.equal(getSkillState(stateSession).active.review?.key, "review");
assert.equal(isSkillActive(stateSession, "review"), true);
assert.equal(listAvailableSkills(registry).length, 2);
assert.deepEqual(listActiveSkills(stateSession, registry).map((entry) => entry.key), ["review"]);
assert.deepEqual(listInactiveSkills(stateSession, registry).map((entry) => entry.key), ["docs"]);
assert.equal(isSkillActive(stateSession.state.get(), "review"), true);

const activationSession = createFakeActionSession({ untouched: true });
const activated = await activateSkill(activationSession, registry, { key: "review", reason: "need review" });
assert.equal(activated.ok, true);
assert.equal(activated.alreadyActive, false);
assert.equal(getSkillState(activationSession).active.review?.reason, "need review");
assert.equal(activationSession.__events.some((event) => event.type === "skill:activation_requested"), true);
assert.equal(activationSession.__events.some((event) => event.type === "skill:activated"), true);
assert.equal(activationSession.__logs.some((log) => log.message.startsWith("skill.activated")), true);

const activatedAgain = await activateSkill(activationSession, registry, { key: "review" });
assert.equal(activatedAgain.ok, true);
assert.equal(activatedAgain.alreadyActive, true);

const unknownActivation = await activateSkill(activationSession, registry, { key: "missing" });
assert.equal(unknownActivation.ok, false);
assert.equal(unknownActivation.code, "skill.unknown");
assert.equal(activationSession.__logs.at(-1)?.level, "warn");

const deactivated = await deactivateSkill(activationSession, registry, { key: "review", reason: "done" });
assert.equal(deactivated.ok, true);
assert.equal(deactivated.alreadyInactive, false);
assert.equal(isSkillActive(activationSession, "review"), false);
assert.equal(activationSession.__events.some((event) => event.type === "skill:deactivated"), true);

const deactivatedAgain = await deactivateSkill(activationSession, registry, { key: "review" });
assert.equal(deactivatedAgain.alreadyInactive, true);
assert.equal((await deactivateSkill(activationSession, registry, { key: "missing" })).code, "skill.unknown");

const activationToolSession = createFakeActionSession();
const activationTool = createSkillActivationTool(registry);
const activationToolResult = await activationTool.execute({ key: "docs", reason: "read docs" }, activationToolSession);
assert.equal(activationToolResult.data?.ok, true);
assert.equal(isSkillActive(activationToolSession, "docs"), true);

const listTool = createSkillListTool(registry);
const listResult = await listTool.execute({ includeTools: false, includeInactive: true }, activationToolSession);
assert.equal(listResult.data?.active[0]?.key, "docs");
assert.equal(listResult.data?.available[0]?.toolNames, undefined);
assert.equal(listResult.data?.inactive?.some((entry) => entry.key === "review"), true);

const provider = createSkillPromptProvider(registry);
const inactivePrompt = contentOf(await provider.render(createFakeActionSession()));
assert.match(inactivePrompt, /Available skills:/);
assert.match(inactivePrompt, /review/);
assert.doesNotMatch(inactivePrompt, /ACTIVE_REVIEW_PROMPT/);

const activePromptSession = createFakeActionSession();
await activateSkill(activePromptSession, registry, { key: "review" });
const activePrompt = contentOf(await provider.render(activePromptSession));
assert.match(activePrompt, /ACTIVE_REVIEW_PROMPT/);

const gatedTool = createSkillGatedTools(registry)[0]!;
assert.equal(gatedTool.name, echoTool.name);
assert.equal(gatedTool.inputSchema, echoTool.inputSchema);
assert.equal(gatedTool.risk, echoTool.risk);
assert.equal(gatedTool.permissions, echoTool.permissions);
assert.equal(gatedTool.requiresApproval, echoTool.requiresApproval);
assert.equal(gatedTool.approvalTimeoutMs, echoTool.approvalTimeoutMs);

const gatedBlockedSession = createFakeActionSession();
const blocked = await gatedTool.execute({ value: "early" }, gatedBlockedSession);
assert.equal(blocked.isError, undefined);
assert.equal((blocked.data as { code?: string }).code, "skill.required");
assert.equal(blocked.metadata?.skillRequired, true);
assert.equal(gatedBlockedSession.__events.some((event) => event.type === "skill:required"), true);
assert.equal(gatedBlockedSession.__logs.some((log) => log.message.startsWith("skill.required")), true);
assert.deepEqual(echoTool.calls, []);

await activateSkill(gatedBlockedSession, registry, { key: "review" });
const delegated = await gatedTool.execute({ value: "late" }, gatedBlockedSession);
assert.equal(delegated.content, "echo:late");
assert.equal(gatedBlockedSession.state.get().echoed, "late");
assert.deepEqual(echoTool.calls, ["late"]);

const filteredGatedTools = createSkillGatedTools([
  reviewSkill,
  defineSkill({
    key: "other",
    description: "Other gated tool.",
    tools: [new OtherTool()],
  }),
], { skillKeys: ["other"] });
assert.deepEqual(filteredGatedTools.map((tool) => tool.name), ["other_echo"]);
assert.throws(
  () => createSkillGatedTools(registry, { skillKeys: ["missing"] }),
  /Unknown skill gate filter key 'missing'/,
);

const kit = createSkillKit([reviewSkill, docsSkill]);
assert.equal(kit.registry.list().length, 2);
assert.equal(kit.tools.some((tool) => tool.name === "activate_skill"), true);
assert.equal(kit.tools.some((tool) => tool.name === "deactivate_skill"), true);
assert.equal(kit.tools.some((tool) => tool.name === "list_skills"), true);
assert.equal(kit.events.includes(SkillActivatedEvent), true);
assert.equal(kit.events.includes(SkillRequiredEvent), true);

class RuntimeEchoTool extends HarnessTool<{ value: string }, { value: string }> {
  name = "runtime_echo";
  description = "Echo through runtime.";
  schema = echoSchema;
  risk = "safe" as const;
  calls: string[] = [];

  execute(args: { value: string }): AgentToolResult<{ value: string }> {
    this.calls.push(args.value);
    return {
      content: `runtime:${args.value}`,
      data: { value: args.value },
    };
  }
}

const runtimeEcho = new RuntimeEchoTool();
const runtimeKit = createSkillKit([
  defineSkill({
    key: "runtime-skill",
    description: "Runtime integration skill.",
    prompt: "ACTIVE_RUNTIME_PROMPT",
    tools: [runtimeEcho],
  }),
]);

class SkillsMode extends HarnessMode {
  label = "Skills";
  prompt = "Use skills when needed.";
  providers = [runtimeKit.provider];
  tools = runtimeKit.tools;
}

const skillsMode = new SkillsMode();
const modelProvider: HarnessModelProvider = {
  namespace: "fake",
  async run(input) {
    const gated = input.tools.find((tool) => tool.name === "runtime_echo");
    const activate = input.tools.find((tool) => tool.name === "activate_skill");
    assert.ok(gated);
    assert.ok(activate);
    assert.match(input.systemPrompt, /Available skills:/);

    const required = await input.executeTool(gated, { value: "early" }, "call-required");
    assert.equal((required.data as { code?: string }).code, "skill.required");

    const activation = await input.executeTool(activate, { key: "runtime-skill", reason: "integration" }, "call-activate");
    assert.equal((activation.data as { ok?: boolean }).ok, true);

    const prepared = await input.prepareContext();
    assert.match(prepared.systemPrompt, /ACTIVE_RUNTIME_PROMPT/);

    const result = await input.executeTool(gated, { value: "late" }, "call-delegated");
    return { content: `${(required.data as { code: string }).code}:${result.content}` };
  },
};

const sink = new MemoryLogSink({ level: "debug" });
const runtimeSession = await createHarnessSession({
  agent: {
    definition: defineAgent({
      key: "skills-runtime",
      label: "Skills Runtime",
      initialMode: skillsMode,
      modes: [skillsMode],
      declaredEvents: runtimeKit.events,
    }),
  },
  providers: [modelProvider],
  defaultModel: "fake/model",
  logging: { level: "debug", sinks: [sink] },
});

try {
  const result = await runtimeSession.send("exercise skill package");
  assert.equal(result.answer, "skill.required:runtime:late");
  assert.deepEqual(runtimeEcho.calls, ["late"]);
  assert.equal(result.events.some((event) => event.type === "skill:required"), true);
  assert.equal(result.events.some((event) => event.type === "skill:activated"), true);
  assert.equal(sink.records.some((record) => record.message.startsWith("skill.required")), true);
  assert.equal(sink.records.some((record) => record.message.startsWith("skill.activated")), true);
} finally {
  await runtimeSession.close();
}

const approvalTool = new EchoTool();
approvalTool.name = "approval_echo";
const approvalKit = createSkillKit([
  defineSkill({
    key: "approval-skill",
    description: "Approval integration skill.",
    prompt: "ACTIVE_APPROVAL_PROMPT",
    tools: [approvalTool],
  }),
]);

class ApprovalSkillsMode extends HarnessMode {
  label = "Approval Skills";
  prompt = "Use approval skill.";
  toolApproval = "deny" as const;
  providers = [approvalKit.provider];
  tools = approvalKit.tools;
}

const approvalMode = new ApprovalSkillsMode();
const approvalProvider: HarnessModelProvider = {
  namespace: "fake",
  async run(input) {
    const activate = input.tools.find((tool) => tool.name === "activate_skill");
    const gated = input.tools.find((tool) => tool.name === "approval_echo");
    assert.ok(activate);
    assert.ok(gated);
    await input.executeTool(activate, { key: "approval-skill" }, "call-approval-activate");
    const denied = await input.executeTool(gated, { value: "blocked" }, "call-approval-denied");
    assert.equal(denied.isError, true);
    assert.equal(denied.metadata?.errorCode, "tool.approval.denied");
    return { content: String(denied.metadata?.errorCode) };
  },
};

const approvalSession = await createHarnessSession({
  agent: {
    definition: defineAgent({
      key: "skills-approval",
      label: "Skills Approval",
      initialMode: approvalMode,
      modes: [approvalMode],
      declaredEvents: approvalKit.events,
    }),
  },
  providers: [approvalProvider],
  defaultModel: "fake/model",
});

try {
  const result = await approvalSession.send("approval still applies");
  assert.equal(result.answer, "tool.approval.denied");
  assert.deepEqual(approvalTool.calls, []);
  assert.equal(result.metrics.errors.at(-1)?.code, "tool.approval.denied");
  assert.equal(result.events.some((event) => event.type === "tool:approval_resolved"), true);
} finally {
  await approvalSession.close();
}
