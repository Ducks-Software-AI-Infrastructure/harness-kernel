import assert from "node:assert/strict";
import {
  createHarnessSession,
  defineAgent,
  HarnessMode,
  HarnessTool,
  s,
  type AgentActionSession,
  type HarnessModelProvider,
} from "../index.js";

type TestState = {
  approvedValue?: string;
};

class ApprovalTool extends HarnessTool<{ value: string }, { value: string }> {
  name = "approval_tool";
  description = "Records an approved value.";
  schema = s.object({ value: s.string().min(1) });
  risk = "write" as const;
  requiresApproval = true;
  calls: string[] = [];

  async execute(args: { value: string }, session: AgentActionSession<TestState>) {
    this.calls.push(args.value);
    session.state.update({ approvedValue: args.value });
    return {
      content: `approved:${args.value}`,
      data: { value: args.value },
    };
  }
}

class ApprovalMode extends HarnessMode {
  label = "Approval";
  prompt = "Use the approval tool.";

  constructor(readonly tool: ApprovalTool, approval?: "ask" | "deny" | "auto" | "tool-default") {
    super();
    this.tools = [tool];
    this.toolApproval = approval;
  }
}

function createAgent(tool: ApprovalTool, approval?: "ask" | "deny" | "auto" | "tool-default") {
  const mode = new ApprovalMode(tool, approval);
  return defineAgent<TestState>({
    key: "approval-agent",
    label: "Approval Agent",
    initialMode: mode,
    modes: [mode],
    sharedState: { initial: () => ({}) },
  });
}

const approvedTool = new ApprovalTool();
const approvingProvider: HarnessModelProvider = {
  namespace: "fake",
  async run(input) {
    const result = await input.executeTool(input.tools[0]!, { value: "ok" }, "call-approved");
    return { content: result.content };
  },
};

const approvingSession = await createHarnessSession({
  agent: { definition: createAgent(approvedTool, "ask") },
  providers: [approvingProvider],
  defaultModel: "fake/model",
});

try {
  const stream = approvingSession.stream("run approved tool");
  let requestedApprovalId: string | undefined;
  let resolvedApprovalId: string | undefined;
  let sawToolEnd = false;

  for await (const event of stream) {
    if (event.type === "tool.approval.requested") {
      requestedApprovalId = event.approval.id;
      assert.equal(event.approval.toolCallId, "call-approved");
      assert.equal(event.approval.name, "approval_tool");
      assert.deepEqual(event.approval.args, { value: "ok" });
      assert.equal(approvingSession.getPendingApprovals().length, 1);
      await event.approval.approve();
    }

    if (event.type === "tool.approval.resolved") {
      resolvedApprovalId = event.approvalId;
      assert.equal(event.approved, true);
    }

    if (event.type === "tool.ended") {
      sawToolEnd = true;
      assert.equal(event.result.content, "approved:ok");
      assert.equal(event.result.isError, undefined);
    }
  }

  const result = await stream.result;
  assert.equal(result.answer, "approved:ok");
  assert.deepEqual(approvedTool.calls, ["ok"]);
  assert.equal(approvingSession.getState().approvedValue, "ok");
  assert.equal(approvingSession.getPendingApprovals().length, 0);
  assert.equal(resolvedApprovalId, requestedApprovalId);
  assert.equal(sawToolEnd, true);
} finally {
  await approvingSession.close();
}

const deniedTool = new ApprovalTool();
const denyingProvider: HarnessModelProvider = {
  namespace: "fake",
  async run(input) {
    const result = await input.executeTool(input.tools[0]!, { value: "blocked" }, "call-denied");
    assert.equal(result.isError, true);
    assert.equal(result.metadata?.errorCode, "tool.approval.denied");
    return { content: String(result.metadata?.errorCode) };
  },
};

const denyingSession = await createHarnessSession({
  agent: { definition: createAgent(deniedTool, "deny") },
  providers: [denyingProvider],
  defaultModel: "fake/model",
});

try {
  const result = await denyingSession.send("deny tool");
  const approvalEvents = result.events.filter((event) => event.type === "tool:approval_resolved");

  assert.equal(result.answer, "tool.approval.denied");
  assert.deepEqual(deniedTool.calls, []);
  assert.equal(approvalEvents.length, 1);
  assert.equal(result.metrics.errors.at(-1)?.code, "tool.approval.denied");
  assert.equal(result.events.some((event) =>
    event.type === "error"
    && (event.payload as { error?: { code?: string; recoverable?: boolean } }).error?.code === "tool.approval.denied"
    && (event.payload as { error?: { code?: string; recoverable?: boolean } }).error?.recoverable === true
  ), true);
  assert.deepEqual(approvalEvents[0]?.payload, {
    id: "call-denied",
    name: "approval_tool",
    args: { value: "blocked" },
    decision: "denied",
    modeId: denyingSession.getMode(),
  });
} finally {
  await denyingSession.close();
}

const timeoutTool = new ApprovalTool();
timeoutTool.approvalTimeoutMs = 10;
const timeoutProvider: HarnessModelProvider = {
  namespace: "fake",
  async run(input) {
    const result = await input.executeTool(input.tools[0]!, { value: "timeout" }, "call-timeout");
    return { content: result.metadata?.errorCode === "tool.approval.denied" ? "timed-out" : "unexpected" };
  },
};

const timeoutSession = await createHarnessSession({
  agent: { definition: createAgent(timeoutTool, "ask") },
  providers: [timeoutProvider],
  defaultModel: "fake/model",
});

try {
  const startedAt = Date.now();
  const result = await timeoutSession.send("timeout tool");
  assert.equal(result.answer, "timed-out");
  assert.equal(timeoutTool.calls.length, 0);
  assert.equal(result.metrics.errors.at(-1)?.code, "tool.approval.denied");
  assert.equal(result.events.some((event) =>
    event.type === "error"
    && (event.payload as { error?: { code?: string; recoverable?: boolean } }).error?.code === "tool.approval.denied"
    && (event.payload as { error?: { code?: string; recoverable?: boolean } }).error?.recoverable === true
  ), true);
  assert.equal(Date.now() - startedAt < 1_000, true);
} finally {
  await timeoutSession.close();
}
